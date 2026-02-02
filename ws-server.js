/**
 * WebSocket Server Extension for Live Analysis
 * 실시간 분석 결과 전송을 위한 WebSocket 서버
 */

import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import { analyzeInBackground, analyzePage } from './live-analyzer.js';

// WebSocket 서버 설정
const WS_PORT = process.env.WS_PORT || 4001;

/**
 * WebSocket 서버 생성 및 시작
 * @param {Object} options
 * @returns {WebSocketServer}
 */
export function createWebSocketServer(options = {}) {
  const port = options.port || WS_PORT;

  const wss = new WebSocketServer({
    port,
    clientTracking: true,
  });

  console.log(`[WebSocket] 서버 시작: ws://localhost:${port}`);

  // 클라이언트 연결 관리
  const clients = new Map();

  wss.on('connection', (ws, request) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    clients.set(ws, { id: clientId, connectedAt: new Date() });

    console.log(`[WebSocket] 클라이언트 연결: ${clientId}`);

    // 연결 확인 메시지
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Safe-Link Sandbox Live Analyzer에 연결되었습니다.',
      timestamp: new Date().toISOString(),
    }));

    // 메시지 핸들러
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(ws, message, clientId);
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `메시지 처리 오류: ${error.message}`,
          timestamp: new Date().toISOString(),
        }));
      }
    });

    // 연결 종료
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WebSocket] 클라이언트 연결 해제: ${clientId}`);
    });

    // 에러 핸들링
    ws.on('error', (error) => {
      console.error(`[WebSocket] 클라이언트 오류 (${clientId}):`, error.message);
      clients.delete(ws);
    });

    // 핑-퐁 (연결 유지)
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });

  // 연결 상태 체크 (30초마다)
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  return wss;
}

/**
 * 메시지 핸들러
 * @param {WebSocket} ws
 * @param {Object} message
 * @param {string} clientId
 */
async function handleMessage(ws, message, clientId) {
  const { type, url, options = {} } = message;

  // 메시지 전송 헬퍼
  const sendMessage = (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  switch (type) {
    case 'analyze':
      await handleAnalyzeRequest(url, sendMessage, options);
      break;

    case 'quick_analyze':
      await handleQuickAnalyze(url, sendMessage, options);
      break;

    case 'ping':
      sendMessage({ type: 'pong', timestamp: new Date().toISOString() });
      break;

    case 'status':
      sendMessage({
        type: 'status',
        clientId,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      sendMessage({
        type: 'error',
        error: `알 수 없는 메시지 타입: ${type}`,
        timestamp: new Date().toISOString(),
      });
  }
}

/**
 * 분석 요청 처리
 * @param {string} url
 * @param {Function} sendMessage
 * @param {Object} options
 */
async function handleAnalyzeRequest(url, sendMessage, options = {}) {
  // URL 유효성 검사
  if (!url || !isValidUrl(url)) {
    sendMessage({
      type: 'error',
      error: '유효하지 않은 URL입니다.',
      url,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  let browser = null;

  try {
    // 브라우저 시작
    sendMessage({
      type: 'analysis_progress',
      stage: 'browser_starting',
      message: '브라우저 시작 중...',
      url,
    });

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720',
        '--disable-extensions',
        '--disable-plugins',
        '--single-process',
      ],
    });

    const page = await browser.newPage();

    // 타임아웃 설정
    const timeout = options.timeout || 30000;
    page.setDefaultNavigationTimeout(timeout);
    page.setDefaultTimeout(timeout);

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setViewport({ width: 1280, height: 720 });

    // 페이지 로드
    sendMessage({
      type: 'analysis_progress',
      stage: 'navigating',
      message: '페이지 로드 중...',
      url,
    });

    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout,
      });
    } catch (navError) {
      // 네비게이션 오류는 경고로 처리하고 계속 진행
      sendMessage({
        type: 'analysis_progress',
        stage: 'navigation_warning',
        message: `페이지 로드 경고: ${navError.message}`,
        url,
      });
    }

    // 백그라운드 분석 실행
    await analyzeInBackground(page, sendMessage, options);

  } catch (error) {
    sendMessage({
      type: 'analysis_error',
      error: error.message,
      url,
      timestamp: new Date().toISOString(),
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 빠른 분석 (Promise 기반)
 * @param {string} url
 * @param {Function} sendMessage
 * @param {Object} options
 */
async function handleQuickAnalyze(url, sendMessage, options = {}) {
  if (!url || !isValidUrl(url)) {
    sendMessage({
      type: 'error',
      error: '유효하지 않은 URL입니다.',
      url,
      timestamp: new Date().toISOString(),
    });
    return;
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
    page.setDefaultNavigationTimeout(options.timeout || 15000);

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const result = await analyzePage(page);

    sendMessage({
      type: 'quick_analysis_complete',
      url,
      ...result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    sendMessage({
      type: 'quick_analysis_error',
      error: error.message,
      url,
      timestamp: new Date().toISOString(),
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * URL 유효성 검사
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// 메인 실행 (직접 실행 시)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const wss = createWebSocketServer();

  process.on('SIGINT', () => {
    console.log('\n[WebSocket] 서버 종료 중...');
    wss.close(() => {
      console.log('[WebSocket] 서버 종료 완료');
      process.exit(0);
    });
  });
}

export default createWebSocketServer;
