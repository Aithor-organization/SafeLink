/**
 * Safe-Link Sandbox WebSocket Server
 * CDP Screencast를 통한 실시간 브라우저 스트리밍
 *
 * 포트: 4000 (WebSocket /sandbox 경로)
 * 기능: 실시간 스크린캐스트, 마우스/키보드 이벤트 처리
 *
 * 변경사항 v2.0:
 * - SandboxSession 클래스 모듈화
 * - SessionManager 기반 세션 관리
 * - 동시 세션 제한 (로컬 데모용: 1개)
 * - 페이지 이동 감지 및 재분석 트리거
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import { SandboxSession, SessionManager, validateUrl, log } from './sandbox-session.js';

// ============================================
// 상수 정의
// ============================================

const PORT = process.env.SANDBOX_PORT || 4000;
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_SESSIONS, 10) || 1; // 로컬 데모용: 1개

// ============================================
// HTTP 서버 생성
// ============================================

const server = http.createServer((req, res) => {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check 엔드포인트
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'safe-link-sandbox-ws',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        sessions: {
          active: sessionManager.getActiveCount(),
          max: MAX_CONCURRENT_SESSIONS,
        },
      })
    );
    return;
  }

  // 세션 상태 엔드포인트
  if (req.url === '/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        sessions: sessionManager.getAllSessionInfo(),
        capacity: {
          current: sessionManager.getActiveCount(),
          max: MAX_CONCURRENT_SESSIONS,
          available: sessionManager.hasCapacity(),
        },
      })
    );
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// ============================================
// WebSocket 서버 생성
// ============================================

const wss = new WebSocketServer({
  server,
  path: '/sandbox',
});

// 세션 매니저 초기화
const sessionManager = new SessionManager({
  maxSessions: MAX_CONCURRENT_SESSIONS,
});

// ============================================
// WebSocket 연결 핸들러
// ============================================

wss.on('connection', async (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  log(`WebSocket 연결 시도: ${clientIp}`);

  // 용량 확인
  if (!sessionManager.hasCapacity()) {
    log(`세션 거부: 용량 초과 (${sessionManager.getActiveCount()}/${MAX_CONCURRENT_SESSIONS})`, 'WARN');
    ws.send(
      JSON.stringify({
        type: 'status',
        state: 'error',
        message: `동시 세션 수가 초과되었습니다. (최대 ${MAX_CONCURRENT_SESSIONS}개)`,
      })
    );
    ws.close(1013, 'Session limit exceeded');
    return;
  }

  // 세션 생성
  const session = sessionManager.createSession(ws, {
    onNavigation: (sess, url) => {
      log(`[Session ${sess.id}] 재분석 콜백 트리거: ${url}`);
      // 여기서 AI 분석기 호출 가능
    },
    onTimeout: (sess) => {
      log(`[Session ${sess.id}] 타임아웃 콜백 트리거`);
    },
  });

  if (!session) {
    ws.send(
      JSON.stringify({
        type: 'status',
        state: 'error',
        message: '세션 생성에 실패했습니다.',
      })
    );
    ws.close(1011, 'Session creation failed');
    return;
  }

  log(`WebSocket 연결 성공: ${session.id} (${clientIp})`);
  session.sendStatus('connected', `WebSocket 연결됨 (세션 ID: ${session.id})`);

  // ============================================
  // 메시지 핸들러
  // ============================================

  ws.on('message', async (rawData) => {
    try {
      const message = JSON.parse(rawData.toString());

      switch (message.type) {
        // 세션 시작
        case 'start':
          if (message.url) {
            const success = await session.initialize(message.url);
            if (success) {
              await session.startScreencast();
            }
          } else {
            session.sendStatus('error', 'URL이 필요합니다.');
          }
          break;

        // 세션 중지
        case 'stop':
          await session.stop();
          break;

        // 입력 이벤트 (통합 처리)
        case 'mousemove':
        case 'click':
        case 'keydown':
        case 'keyup':
        case 'keypress':
        case 'scroll':
          await session.handleInput(message);
          break;

        // 세션 정보 요청
        case 'info':
          session.send({
            type: 'sessionInfo',
            ...session.getInfo(),
          });
          break;

        // 스크린샷 요청
        case 'screenshot':
          const screenshot = await session.captureScreenshot();
          if (screenshot) {
            session.send({
              type: 'screenshot',
              data: screenshot,
            });
          }
          break;

        // 페이지 콘텐츠 요청
        case 'getContent':
          const content = await session.getPageContent();
          if (content) {
            session.send({
              type: 'pageContent',
              html: content,
            });
          }
          break;

        default:
          log(`[Session ${session.id}] 알 수 없는 메시지 타입: ${message.type}`, 'WARN');
      }
    } catch (error) {
      log(`[Session ${session.id}] 메시지 처리 오류: ${error.message}`, 'ERROR');
      session.sendStatus('error', '메시지 처리 실패');
    }
  });

  // ============================================
  // 연결 종료 핸들러
  // ============================================

  ws.on('close', async (code, reason) => {
    log(`WebSocket 연결 종료: ${session.id} (code: ${code}, reason: ${reason})`);
    await session.cleanup();
  });

  // ============================================
  // 에러 핸들러
  // ============================================

  ws.on('error', (error) => {
    log(`WebSocket 오류: ${session.id} - ${error.message}`, 'ERROR');
  });
});

// ============================================
// 서버 시작
// ============================================

server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Safe-Link Sandbox WebSocket Server v2.0          ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║   Port: ${PORT}                                        ║`);
  console.log('║   Path: /sandbox                                   ║');
  console.log('║   Timeout: 5분                                     ║');
  console.log(`║   Max Sessions: ${MAX_CONCURRENT_SESSIONS}                                  ║`);
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║   Features:                                        ║');
  console.log('║     - CDP Screencast (JPEG, 80%)                   ║');
  console.log('║     - Mouse/Keyboard Events                        ║');
  console.log('║     - URL Filtering (SSRF 방지)                    ║');
  console.log('║     - Redirect Limiting (max 5)                    ║');
  console.log('║     - Page Navigation Detection                    ║');
  console.log('║     - Session Manager with Capacity Control        ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║   Endpoints:                                       ║');
  console.log('║     - GET /health    - Health check                ║');
  console.log('║     - GET /sessions  - Session info                ║');
  console.log('║     - WS  /sandbox   - WebSocket endpoint          ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
});

// ============================================
// 프로세스 종료 핸들러
// ============================================

async function gracefulShutdown(signal) {
  log(`${signal} 수신, 서버 종료 시작...`, 'INFO');

  // 모든 세션 정리
  await sessionManager.cleanupAll();

  // HTTP 서버 종료
  server.close(() => {
    log('서버 종료 완료', 'INFO');
    process.exit(0);
  });

  // 강제 종료 타이머 (10초)
  setTimeout(() => {
    log('강제 종료', 'WARN');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ============================================
// Export
// ============================================

export { sessionManager, server, wss };
