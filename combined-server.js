/**
 * Combined Server (Express HTTP + WebSocket)
 * HTTP API와 WebSocket 실시간 분석을 하나의 서버에서 제공
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';

import { analyzeUrl, quickCheck } from './analyzer.js';
import { analyzeInBackground, analyzePage, collectAnalysisData } from './live-analyzer.js';

// 설정
const PORT = process.env.PORT || 4000;
const WS_PATH = '/ws';
const ANALYSIS_TIMEOUT = 30000;

// Express 앱 설정
const app = express();

// 보안 헤더
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// CORS 설정
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// JSON 파싱
app.use(express.json({ limit: '1mb' }));

// 요청 로깅
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Rate Limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '요청 한도를 초과했습니다.',
    },
  },
});

app.use('/api/', limiter);

// ============================================
// HTTP API Routes
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'safe-link-sandbox-combined',
    version: '1.3.0',
    features: ['http-api', 'websocket-live-analysis'],
    timestamp: new Date().toISOString(),
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Safe-Link Sandbox Combined API',
    version: '1.3.0',
    endpoints: {
      'POST /api/analyze': 'URL 전체 분석 (동기)',
      'POST /api/quick-check': 'URL 빠른 검사',
      'POST /api/live-analyze': 'URL 실시간 분석 (HTTP, 결과 포함)',
      'WS /ws': 'WebSocket 실시간 분석',
    },
  });
});

// 기존 동기 분석 API
app.post('/api/analyze', async (req, res) => {
  const { url, options = {} } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_URL', message: 'URL이 필요합니다.' },
    });
  }

  try {
    const result = await analyzeUrl(url, {
      timeout: Math.min(options.timeout || ANALYSIS_TIMEOUT, ANALYSIS_TIMEOUT),
      takeScreenshot: options.takeScreenshot !== false,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ANALYSIS_ERROR', message: error.message },
    });
  }
});

// 빠른 검사 API
app.post('/api/quick-check', (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_URL', message: 'URL이 필요합니다.' },
    });
  }

  const result = quickCheck(url);
  res.json({ success: true, data: result });
});

// 새로운 Live Analyze API (HTTP 버전)
app.post('/api/live-analyze', async (req, res) => {
  const { url, options = {} } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_URL', message: 'URL이 필요합니다.' },
    });
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
      ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(options.timeout || ANALYSIS_TIMEOUT);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto(url, { waitUntil: 'networkidle2' }).catch(() => {});

    const result = await analyzePage(page);

    res.json({
      success: true,
      data: {
        url,
        title: await page.title().catch(() => ''),
        ...result,
        analyzedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'LIVE_ANALYSIS_ERROR', message: error.message },
    });
  } finally {
    if (browser) await browser.close();
  }
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: '엔드포인트를 찾을 수 없습니다.' },
  });
});

// ============================================
// HTTP 서버 + WebSocket 설정
// ============================================

const server = createServer(app);

const wss = new WebSocketServer({
  server,
  path: WS_PATH,
});

// WebSocket 연결 관리
wss.on('connection', (ws, request) => {
  const clientId = `client_${Date.now()}`;
  console.log(`[WebSocket] 클라이언트 연결: ${clientId}`);

  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'Safe-Link Sandbox Live Analyzer에 연결되었습니다.',
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleWsMessage(ws, message);
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message,
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] 클라이언트 연결 해제: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] 오류:`, error.message);
  });
});

/**
 * WebSocket 메시지 핸들러
 */
async function handleWsMessage(ws, message) {
  const { type, url, options = {} } = message;

  const sendMessage = (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  if (type === 'analyze' || type === 'live_analyze') {
    if (!url || !isValidUrl(url)) {
      sendMessage({ type: 'error', error: '유효하지 않은 URL입니다.' });
      return;
    }

    let browser = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(options.timeout || ANALYSIS_TIMEOUT);

      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(url, { waitUntil: 'networkidle2' }).catch(() => {});

      await analyzeInBackground(page, sendMessage, options);

    } catch (error) {
      sendMessage({ type: 'analysis_error', error: error.message, url });
    } finally {
      if (browser) await browser.close();
    }
  } else if (type === 'ping') {
    sendMessage({ type: 'pong', timestamp: new Date().toISOString() });
  } else if (type === 'status') {
    sendMessage({
      type: 'status',
      uptime: process.uptime(),
      connections: wss.clients.size,
    });
  }
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ============================================
// 서버 시작
// ============================================

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Safe-Link Sandbox Combined Server v1.3.0             ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  HTTP API:    http://localhost:${PORT}                      ║`);
  console.log(`║  WebSocket:   ws://localhost:${PORT}${WS_PATH}                      ║`);
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                            ║');
  console.log('║    POST /api/analyze       - 동기 분석                 ║');
  console.log('║    POST /api/quick-check   - 빠른 검사                 ║');
  console.log('║    POST /api/live-analyze  - 실시간 분석 (HTTP)        ║');
  console.log('║    WS   /ws                - 실시간 분석 (WebSocket)   ║');
  console.log('╚════════════════════════════════════════════════════════╝');
});

export default server;
