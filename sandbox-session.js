/**
 * SandboxSession - 샌드박스 브라우저 세션 관리 클래스
 *
 * 기능:
 * - UUID 기반 세션 ID 생성
 * - 5분 타임아웃 관리
 * - 브라우저/페이지 인스턴스 관리
 * - CDP Screencast 스트리밍
 * - 입력 이벤트 처리 (마우스, 키보드, 스크롤)
 * - 페이지 이동 감지 및 재분석 트리거
 */

import crypto from 'crypto';
import puppeteer from 'puppeteer';

// ============================================
// 상수 정의
// ============================================

const SESSION_TIMEOUT = 5 * 60 * 1000; // 5분
const MAX_REDIRECTS = 5;
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;

// 차단할 IP 패턴 (내부 네트워크)
const BLOCKED_PATTERNS = [
  /^127\./,
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
];

// ============================================
// 유틸리티 함수
// ============================================

/**
 * URL 안전성 검사
 * @param {string} url - 검사할 URL
 * @returns {{ safe: boolean, reason?: string }}
 */
function validateUrl(url) {
  try {
    const parsed = new URL(url);

    // 프로토콜 검사
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: 'HTTP/HTTPS 프로토콜만 허용됩니다.' };
    }

    // 호스트 검사 (내부 네트워크 차단)
    const hostname = parsed.hostname.toLowerCase();
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(hostname)) {
        return { safe: false, reason: '내부 네트워크 접근이 차단되었습니다.' };
      }
    }

    return { safe: true };
  } catch (error) {
    return { safe: false, reason: '유효하지 않은 URL 형식입니다.' };
  }
}

/**
 * 로그 출력 (타임스탬프 포함)
 * @param {string} message - 로그 메시지
 * @param {string} level - 로그 레벨
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// ============================================
// SandboxSession 클래스
// ============================================

export class SandboxSession {
  /**
   * 세션 생성자
   * @param {WebSocket} ws - WebSocket 연결
   * @param {object} [options] - 옵션
   * @param {function} [options.onNavigation] - 페이지 이동 시 콜백
   * @param {function} [options.onTimeout] - 타임아웃 시 콜백
   * @param {function} [options.onClose] - 세션 종료 시 콜백
   */
  constructor(ws, options = {}) {
    // 고유 세션 ID (UUID v4)
    this.id = crypto.randomUUID();

    // WebSocket 연결
    this.ws = ws;

    // 브라우저 인스턴스
    this.browser = null;

    // 페이지 인스턴스
    this.page = null;

    // CDP 클라이언트
    this.cdpClient = null;

    // 생성 시간
    this.createdAt = Date.now();

    // 타임아웃 설정 (5분)
    this.timeout = SESSION_TIMEOUT;

    // 타임아웃 ID
    this.timeoutId = null;

    // 리다이렉트 카운트
    this.redirectCount = 0;

    // 활성 상태
    this.isActive = false;

    // 현재 URL
    this.currentUrl = null;

    // 뷰포트 설정
    this.viewportWidth = DEFAULT_VIEWPORT_WIDTH;
    this.viewportHeight = DEFAULT_VIEWPORT_HEIGHT;

    // 콜백 함수
    this.onNavigation = options.onNavigation || null;
    this.onTimeout = options.onTimeout || null;
    this.onClose = options.onClose || null;

    log(`[Session ${this.id}] 세션 생성됨`);
  }

  // ============================================
  // 메시지 전송 메서드
  // ============================================

  /**
   * 메시지 전송 (JSON)
   * @param {object} data - 전송할 데이터
   */
  send(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * 상태 메시지 전송
   * @param {string} state - 상태 (connected|loading|ready|error)
   * @param {string} [message] - 추가 메시지
   */
  sendStatus(state, message = '') {
    this.send({
      type: 'status',
      state,
      message,
      sessionId: this.id,
    });
  }

  /**
   * 프레임 전송
   * @param {string} data - Base64 인코딩된 이미지 데이터
   */
  sendFrame(data) {
    this.send({
      type: 'frame',
      data,
    });
  }

  /**
   * URL 변경 알림 전송
   * @param {string} url - 새로운 URL
   */
  sendUrlChange(url) {
    this.send({
      type: 'urlChange',
      url,
      sessionId: this.id,
    });
  }

  // ============================================
  // 타임아웃 관리
  // ============================================

  /**
   * 타임아웃 리셋
   */
  resetTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      log(`[Session ${this.id}] 타임아웃 발생 (5분)`, 'WARN');
      this.sendStatus('error', '세션 시간이 만료되었습니다. (5분)');

      if (this.onTimeout) {
        this.onTimeout(this);
      }

      this.cleanup();
    }, this.timeout);
  }

  /**
   * 타임아웃 클리어
   */
  clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // ============================================
  // 세션 초기화 및 시작
  // ============================================

  /**
   * 세션 초기화 및 URL 로드
   * @param {string} url - 로드할 URL
   * @returns {Promise<boolean>} 성공 여부
   */
  async initialize(url) {
    // URL 검증
    const validation = validateUrl(url);
    if (!validation.safe) {
      this.sendStatus('error', validation.reason);
      return false;
    }

    try {
      this.sendStatus('loading', 'Puppeteer 브라우저 시작 중...');
      this.resetTimeout();

      // Puppeteer 브라우저 시작
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      });

      this.page = await this.browser.newPage();

      // 뷰포트 설정
      await this.page.setViewport({
        width: this.viewportWidth,
        height: this.viewportHeight,
      });

      // 페이지 이동 감지 설정
      this.setupNavigationDetection();

      // 리다이렉트 추적
      this.page.on('response', (response) => {
        const status = response.status();
        if (status >= 300 && status < 400) {
          this.redirectCount++;
          if (this.redirectCount > MAX_REDIRECTS) {
            log(`[Session ${this.id}] 리다이렉트 초과`, 'WARN');
            this.sendStatus('error', '리다이렉트 횟수가 초과되었습니다.');
            this.stop();
          }
        }
      });

      // CDP 클라이언트 연결
      this.cdpClient = await this.page.createCDPSession();

      // 페이지 로드
      this.sendStatus('loading', `${url} 로딩 중...`);
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      this.currentUrl = url;
      this.isActive = true;

      log(`[Session ${this.id}] 페이지 로드 완료: ${url}`);
      return true;
    } catch (error) {
      log(`[Session ${this.id}] 초기화 오류: ${error.message}`, 'ERROR');
      this.sendStatus('error', `로드 실패: ${error.message}`);
      await this.cleanup();
      return false;
    }
  }

  /**
   * 페이지 이동 감지 설정
   */
  setupNavigationDetection() {
    if (!this.page) return;

    // 메인 프레임 이동 감지
    this.page.on('framenavigated', async (frame) => {
      if (frame === this.page.mainFrame()) {
        const newUrl = frame.url();

        // URL이 변경된 경우에만 처리
        if (newUrl !== this.currentUrl && newUrl !== 'about:blank') {
          log(`[Session ${this.id}] 페이지 이동 감지: ${this.currentUrl} -> ${newUrl}`);

          this.currentUrl = newUrl;
          this.sendUrlChange(newUrl);

          // 재분석 트리거
          await this.triggerReanalysis();
        }
      }
    });
  }

  /**
   * 페이지 재분석 트리거
   */
  async triggerReanalysis() {
    log(`[Session ${this.id}] 재분석 트리거: ${this.currentUrl}`);

    // 재분석 이벤트 전송
    this.send({
      type: 'reanalyze',
      url: this.currentUrl,
      sessionId: this.id,
      timestamp: Date.now(),
    });

    // 콜백 호출
    if (this.onNavigation) {
      this.onNavigation(this, this.currentUrl);
    }
  }

  // ============================================
  // Screencast 제어
  // ============================================

  /**
   * Screencast 시작
   * @returns {Promise<boolean>} 성공 여부
   */
  async startScreencast() {
    if (!this.cdpClient || !this.isActive) {
      return false;
    }

    try {
      // Screencast 이벤트 핸들러
      this.cdpClient.on('Page.screencastFrame', async (frame) => {
        // 프레임 전송
        this.sendFrame(frame.data);

        // 프레임 ACK
        try {
          await this.cdpClient.send('Page.screencastFrameAck', {
            sessionId: frame.sessionId,
          });
        } catch (error) {
          // ACK 실패는 무시 (연결 종료 시 발생 가능)
        }
      });

      // Screencast 시작
      await this.cdpClient.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 80,
        maxWidth: this.viewportWidth,
        maxHeight: this.viewportHeight,
        everyNthFrame: 1,
      });

      this.sendStatus('ready', 'Screencast 활성화됨');
      log(`[Session ${this.id}] Screencast 시작됨`);

      return true;
    } catch (error) {
      log(`[Session ${this.id}] Screencast 시작 오류: ${error.message}`, 'ERROR');
      return false;
    }
  }

  /**
   * Screencast 중지
   * @returns {Promise<void>}
   */
  async stopScreencast() {
    if (this.cdpClient && this.isActive) {
      try {
        await this.cdpClient.send('Page.stopScreencast');
        log(`[Session ${this.id}] Screencast 중지됨`);
      } catch (error) {
        // 이미 종료된 경우 무시
      }
    }
  }

  // ============================================
  // 입력 이벤트 처리
  // ============================================

  /**
   * 입력 이벤트 처리 (통합 핸들러)
   * @param {object} message - 입력 메시지
   * @returns {Promise<void>}
   */
  async handleInput(message) {
    if (!this.page || !this.isActive) return;
    this.resetTimeout();

    try {
      switch (message.type) {
        case 'mousemove':
          await this.handleMouseMove(message.x, message.y);
          break;

        case 'click':
          await this.handleClick(message.x, message.y, message.button);
          break;

        case 'keydown':
          await this.handleKeyDown(message.key);
          break;

        case 'keypress':
          await this.handleKeyPress(message.char);
          break;

        case 'keyup':
          await this.handleKeyUp(message.key);
          break;

        case 'scroll':
          await this.handleScroll(message.deltaX, message.deltaY);
          break;

        default:
          log(`[Session ${this.id}] 알 수 없는 입력 타입: ${message.type}`, 'WARN');
      }
    } catch (error) {
      log(`[Session ${this.id}] 입력 처리 오류: ${error.message}`, 'ERROR');
    }
  }

  /**
   * 마우스 이동 처리
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   */
  async handleMouseMove(x, y) {
    if (!this.page || !this.isActive) return;

    try {
      await this.page.mouse.move(x, y);
    } catch (error) {
      log(`[Session ${this.id}] 마우스 이동 오류: ${error.message}`, 'ERROR');
    }
  }

  /**
   * 클릭 처리
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {string} [button='left'] - 마우스 버튼 (left|right|middle)
   */
  async handleClick(x, y, button = 'left') {
    if (!this.page || !this.isActive) return;

    try {
      await this.page.mouse.click(x, y, { button });
      log(`[Session ${this.id}] 클릭: (${x}, ${y}) ${button}`);
    } catch (error) {
      log(`[Session ${this.id}] 클릭 오류: ${error.message}`, 'ERROR');
    }
  }

  /**
   * 키 다운 처리
   * @param {string} key - 키 이름
   */
  async handleKeyDown(key) {
    if (!this.page || !this.isActive) return;

    try {
      await this.page.keyboard.down(key);
    } catch (error) {
      log(`[Session ${this.id}] 키 다운 오류: ${error.message}`, 'ERROR');
    }
  }

  /**
   * 키 업 처리
   * @param {string} key - 키 이름
   */
  async handleKeyUp(key) {
    if (!this.page || !this.isActive) return;

    try {
      await this.page.keyboard.up(key);
    } catch (error) {
      log(`[Session ${this.id}] 키 업 오류: ${error.message}`, 'ERROR');
    }
  }

  /**
   * 키 프레스 처리 (문자 입력)
   * @param {string} char - 입력할 문자
   */
  async handleKeyPress(char) {
    if (!this.page || !this.isActive) return;

    try {
      await this.page.keyboard.type(char);
    } catch (error) {
      log(`[Session ${this.id}] 키 입력 오류: ${error.message}`, 'ERROR');
    }
  }

  /**
   * 스크롤 처리
   * @param {number} deltaX - X 스크롤량
   * @param {number} deltaY - Y 스크롤량
   */
  async handleScroll(deltaX = 0, deltaY = 0) {
    if (!this.page || !this.isActive) return;

    try {
      // mouse.wheel 사용 (Puppeteer v20+)
      await this.page.mouse.wheel({ deltaX, deltaY });
    } catch (error) {
      // 구버전 Puppeteer 대응
      try {
        await this.page.evaluate(
          (dx, dy) => {
            window.scrollBy(dx, dy);
          },
          deltaX,
          deltaY
        );
      } catch (evalError) {
        log(`[Session ${this.id}] 스크롤 오류: ${evalError.message}`, 'ERROR');
      }
    }
  }

  // ============================================
  // 세션 정리
  // ============================================

  /**
   * Screencast 중지
   */
  async stop() {
    await this.stopScreencast();
    this.isActive = false;
    this.sendStatus('connected', 'Screencast 중지됨');
  }

  /**
   * 세션 완전 정리
   * @returns {Promise<void>}
   */
  async cleanup() {
    log(`[Session ${this.id}] 세션 정리 시작`);

    // 타이머 정리
    this.clearTimeout();

    // Screencast 중지
    if (this.cdpClient) {
      try {
        await this.cdpClient.send('Page.stopScreencast');
      } catch (error) {
        // 무시
      }
      this.cdpClient = null;
    }

    // 브라우저 종료
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        // 무시
      }
      this.browser = null;
    }

    // 상태 초기화
    this.page = null;
    this.isActive = false;
    this.currentUrl = null;

    // 종료 콜백 호출
    if (this.onClose) {
      this.onClose(this);
    }

    log(`[Session ${this.id}] 세션 정리 완료`);
  }

  // ============================================
  // 유틸리티 메서드
  // ============================================

  /**
   * 세션 정보 반환
   * @returns {object} 세션 정보
   */
  getInfo() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      isActive: this.isActive,
      currentUrl: this.currentUrl,
      uptime: Date.now() - this.createdAt,
      viewport: {
        width: this.viewportWidth,
        height: this.viewportHeight,
      },
    };
  }

  /**
   * 현재 페이지 스크린샷 캡처
   * @returns {Promise<string|null>} Base64 인코딩된 이미지 또는 null
   */
  async captureScreenshot() {
    if (!this.page || !this.isActive) return null;

    try {
      const screenshot = await this.page.screenshot({
        encoding: 'base64',
        type: 'jpeg',
        quality: 80,
      });
      return screenshot;
    } catch (error) {
      log(`[Session ${this.id}] 스크린샷 캡처 오류: ${error.message}`, 'ERROR');
      return null;
    }
  }

  /**
   * 현재 페이지 HTML 가져오기
   * @returns {Promise<string|null>} HTML 문자열 또는 null
   */
  async getPageContent() {
    if (!this.page || !this.isActive) return null;

    try {
      return await this.page.content();
    } catch (error) {
      log(`[Session ${this.id}] 페이지 콘텐츠 가져오기 오류: ${error.message}`, 'ERROR');
      return null;
    }
  }
}

// ============================================
// 세션 매니저 클래스
// ============================================

export class SessionManager {
  /**
   * 세션 매니저 생성자
   * @param {object} [options] - 옵션
   * @param {number} [options.maxSessions=1] - 최대 동시 세션 수
   */
  constructor(options = {}) {
    this.sessions = new Map();
    this.maxSessions = options.maxSessions || 1; // 로컬 데모용 기본값: 1
  }

  /**
   * 새 세션 생성
   * @param {WebSocket} ws - WebSocket 연결
   * @param {object} [options] - 세션 옵션
   * @returns {SandboxSession|null} 생성된 세션 또는 null
   */
  createSession(ws, options = {}) {
    // 동시 세션 수 제한 확인
    if (this.sessions.size >= this.maxSessions) {
      log(`세션 제한 초과: 현재 ${this.sessions.size}/${this.maxSessions}`, 'WARN');
      return null;
    }

    // 세션 종료 시 자동 제거 콜백 추가
    const sessionOptions = {
      ...options,
      onClose: (session) => {
        this.sessions.delete(session.id);
        log(`세션 제거됨: ${session.id} (남은 세션: ${this.sessions.size})`);
        if (options.onClose) options.onClose(session);
      },
    };

    const session = new SandboxSession(ws, sessionOptions);
    this.sessions.set(session.id, session);

    log(`새 세션 생성: ${session.id} (총 세션: ${this.sessions.size}/${this.maxSessions})`);
    return session;
  }

  /**
   * 세션 가져오기
   * @param {string} sessionId - 세션 ID
   * @returns {SandboxSession|undefined} 세션 또는 undefined
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * 세션 삭제
   * @param {string} sessionId - 세션 ID
   * @returns {Promise<boolean>} 삭제 성공 여부
   */
  async removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.cleanup();
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * 모든 세션 정리
   * @returns {Promise<void>}
   */
  async cleanupAll() {
    log(`모든 세션 정리 시작 (${this.sessions.size}개)`);

    const cleanupPromises = [];
    for (const [sessionId, session] of this.sessions) {
      cleanupPromises.push(session.cleanup());
    }

    await Promise.all(cleanupPromises);
    this.sessions.clear();

    log('모든 세션 정리 완료');
  }

  /**
   * 활성 세션 수 반환
   * @returns {number} 활성 세션 수
   */
  getActiveCount() {
    return this.sessions.size;
  }

  /**
   * 모든 세션 정보 반환
   * @returns {object[]} 세션 정보 배열
   */
  getAllSessionInfo() {
    const info = [];
    for (const session of this.sessions.values()) {
      info.push(session.getInfo());
    }
    return info;
  }

  /**
   * 세션 공간 사용 가능 여부
   * @returns {boolean} 사용 가능 여부
   */
  hasCapacity() {
    return this.sessions.size < this.maxSessions;
  }
}

// ============================================
// Export
// ============================================

export { validateUrl, log };
