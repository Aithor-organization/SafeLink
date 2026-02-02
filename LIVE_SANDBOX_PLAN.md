# Live Sandbox 구현 계획서

실시간 샌드박스 접속 기능 - 사용자가 격리된 브라우저에서 직접 URL 탐색 + AI 실시간 감시

## 1. 개요

### 목표
- 스크린샷 대신 **실시간 브라우저 화면** 제공
- 사용자가 샌드박스 내에서 **마우스/키보드 조작** 가능
- 악성 사이트가 **사용자 PC와 완전 격리**
- **AI 멀티모달 분석**: 소스코드 + 스크린샷 동시 분석
- **비동기 분석**: 즉시 접속, 백그라운드에서 분석 후 결과 표시

### 기대 효과
- 더 강력한 데모 시연
- 사용자가 직접 피싱 사이트 구조 확인 가능
- "진짜 샌드박스" 느낌 제공
- 대기 시간 없이 즉시 탐색 시작
- 탐색하면서 AI 분석 결과 자동 업데이트

---

## 2. 기술 스택

| 구성요소 | 기술 | 역할 |
|----------|------|------|
| **브라우저 엔진** | Puppeteer (Chromium) | 격리된 브라우저 실행 |
| **화면 스트리밍** | Puppeteer screencast | CDP 기반 프레임 캡처 |
| **실시간 통신** | WebSocket (ws) | 양방향 이벤트 전송 |
| **프론트엔드** | Canvas + React | 화면 렌더링 + 입력 캡처 |
| **AI 분석** | Gemini 3 Flash (OpenRouter) | 멀티모달 위협 탐지 |
| **분석 대상** | 소스코드 + 스크린샷 | HTML, JS, 폼, 시각적 요소 |

---

## 3. 아키텍처

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   Live Sandbox + AI 실시간 감시 시스템                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐              ┌─────────────────────────────┐  │
│  │   React Client       │              │      Backend Server         │  │
│  │                      │              │                             │  │
│  │  ┌────────────────┐  │    WS        │  ┌───────────────────────┐  │  │
│  │  │  위험도 패널   │◄─┼──────────────┼──│  AI 분석 엔진         │  │  │
│  │  │  (상단 표시)   │  │  Analysis    │  │  (Gemini 3 Flash)     │  │  │
│  │  └────────────────┘  │              │  └───────────┬───────────┘  │  │
│  │                      │              │              │              │  │
│  │  ┌────────────────┐  │    WS        │  ┌───────────▼───────────┐  │  │
│  │  │  Canvas 화면   │◄─┼──────────────┼──│  Puppeteer Session    │  │  │
│  │  │  (하단 표시)   │  │   Frame      │  │  (Headless Chrome)    │  │  │
│  │  └────────────────┘  │              │  └───────────┬───────────┘  │  │
│  │                      │              │              │              │  │
│  │  ┌────────────────┐  │    WS        │              │              │  │
│  │  │ Mouse/Keyboard │──┼──────────────┼──────────────┘              │  │
│  │  │    Capture     │  │   Event      │                             │  │
│  │  └────────────────┘  │              │  ┌───────────────────────┐  │  │
│  └──────────────────────┘              │  │  분석 데이터 수집     │  │  │
│                                        │  │  • 소스코드 (HTML/JS) │  │  │
│                                        │  │  • 스크린샷           │  │  │
│                                        │  │  • 폼 정보            │  │  │
│                                        │  │  • 네트워크 요청      │  │  │
│                                        │  └───────────────────────┘  │  │
│                                        └─────────────────────────────┘  │
│                                                     │                    │
│                                                     ▼                    │
│                                        ┌──────────────────────┐         │
│                                        │    Target Website    │         │
│                                        │  (Sandboxed Access)  │         │
│                                        └──────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 데이터 흐름

### 비동기 분석 흐름 (핵심)
```
시간 ──────────────────────────────────────────────────────────────────►

사용자:  [URL 입력] ──► [즉시 샌드박스 접속] ──► [탐색 중...] ──► [계속 탐색]
                              │                        │
                              │                        ▼
                              │                   ⚠️ 분석 결과 표시
                              │                   "위험도: 65점"
                              │
백그라운드:            [스크린샷 캡처]
                       [소스코드 수집]
                              │
                              ▼
                       [AI 분석 진행...]
                       (2-3초 소요)
                              │
                              ▼
                       [완료 → WebSocket 전송]
```

### 화면 스트리밍 (Server → Client)
```
Puppeteer CDP → screencastFrame 이벤트 → Base64 JPEG → WebSocket → Canvas 렌더링
```

### 입력 전달 (Client → Server)
```
Mouse/Keyboard 이벤트 → WebSocket → Puppeteer page.mouse / page.keyboard
```

### AI 분석 데이터 (Server → AI → Client)
```
페이지 로드/이동 → 소스코드 + 스크린샷 수집 → Gemini 3 Flash 분석 → WebSocket → 위험도 패널 업데이트
```

---

## 5. API 설계

### WebSocket 엔드포인트

**연결**: `ws://localhost:4000/sandbox`

### 메시지 프로토콜

#### Client → Server

```typescript
// 세션 시작
{ type: "start", url: "https://example.com" }

// 마우스 이동
{ type: "mousemove", x: 100, y: 200 }

// 마우스 클릭
{ type: "click", x: 100, y: 200, button: "left" }

// 키보드 입력
{ type: "keydown", key: "Enter" }
{ type: "keypress", char: "a" }

// 스크롤
{ type: "scroll", deltaX: 0, deltaY: 100 }

// 세션 종료
{ type: "stop" }
```

#### Server → Client

```typescript
// 화면 프레임
{ type: "frame", data: "base64-jpeg-data", timestamp: 1234567890 }

// 세션 상태
{ type: "status", state: "connected" | "loading" | "ready" | "error" }

// AI 분석 시작 (로딩 표시용)
{ type: "analysis_started", url: "https://example.com" }

// AI 분석 완료 (멀티모달 결과)
{
  type: "analysis_complete",
  riskScore: 65,
  riskLevel: "warning",
  summary: "네이버 로그인 페이지 위조 의심",
  findings: [
    { category: "phishing", severity: "high", description: "비밀번호 필드 → 외부 서버 전송" },
    { category: "visual", severity: "medium", description: "네이버 로고 위조 가능성" },
    { category: "content", severity: "medium", description: "긴급 문구로 사용자 압박" }
  ],
  codeAnalysis: {
    hiddenFields: 3,
    externalScripts: 5,
    suspiciousPatterns: ["eval()", "document.write"]
  },
  recommendations: ["개인정보 입력 금지", "공식 사이트 주소 확인"],
  confidence: 85
}

// 에러
{ type: "error", message: "Connection timeout" }
```

---

## 6. 구현 단계

### Phase 1: 백엔드 - Screencast 서버 (2시간)

#### 6.1 WebSocket 서버 설정
```javascript
// sandbox-server.js
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
```

#### 6.2 Puppeteer CDP Screencast
```javascript
// CDP 프로토콜로 화면 캡처
const client = await page.target().createCDPSession();
await client.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 80,
  maxWidth: 1280,
  maxHeight: 720,
  everyNthFrame: 1
});

client.on('Page.screencastFrame', async (frame) => {
  ws.send(JSON.stringify({ type: 'frame', data: frame.data }));
  await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
});
```

#### 6.3 입력 이벤트 처리
```javascript
// 마우스 클릭 전달
await page.mouse.click(x, y);

// 키보드 입력 전달
await page.keyboard.type(char);
```

#### 6.4 비동기 AI 분석 (백그라운드)
```javascript
// 세션 시작 시 - 즉시 샌드박스 연결 + 백그라운드 분석
async function startSession(url, ws) {
  const page = await browser.newPage();
  await page.goto(url);

  // 1. 즉시 화면 스트리밍 시작 (사용자 대기 없음)
  await startScreencast(page, ws);

  // 2. 백그라운드 AI 분석 (await 안 함 - 병렬 실행)
  analyzeInBackground(page, ws);
}

async function analyzeInBackground(page, ws) {
  ws.send(JSON.stringify({ type: 'analysis_started', url: page.url() }));

  // 소스코드 + 스크린샷 수집
  const [screenshot, html, forms, scripts] = await Promise.all([
    page.screenshot({ encoding: 'base64' }),
    page.content(),
    getFormInfo(page),
    getScriptInfo(page)
  ]);

  // AI 멀티모달 분석 (Gemini 3 Flash)
  const result = await analyzeWithAI({
    screenshot,
    sourceCode: { html, forms, scripts },
    url: page.url(),
    title: await page.title()
  });

  // 완료 시 WebSocket으로 결과 전송
  ws.send(JSON.stringify({ type: 'analysis_complete', ...result }));
}

// 페이지 이동 감지 → 재분석
page.on('framenavigated', async (frame) => {
  if (frame === page.mainFrame()) {
    analyzeInBackground(page, ws);  // 새 페이지 분석
  }
});
```

#### 6.5 소스코드 수집 함수
```javascript
async function getFormInfo(page) {
  return page.evaluate(() => {
    return [...document.forms].map(f => ({
      action: f.action,
      method: f.method,
      fields: [...f.elements].map(e => ({
        name: e.name,
        type: e.type,
        id: e.id
      }))
    }));
  });
}

async function getScriptInfo(page) {
  return page.evaluate(() => {
    return [...document.scripts].map(s => ({
      src: s.src,
      content: s.src ? null : s.textContent?.substring(0, 1000)  // 인라인 스크립트
    }));
  });
}
```

### Phase 2: 프론트엔드 - Canvas 뷰어 (2시간)

#### 6.4 Canvas 렌더링
```jsx
// SandboxViewer.jsx
const canvasRef = useRef();
const img = new Image();

ws.onmessage = (e) => {
  const { type, data } = JSON.parse(e.data);
  if (type === 'frame') {
    img.src = `data:image/jpeg;base64,${data}`;
    img.onload = () => ctx.drawImage(img, 0, 0);
  }
};
```

#### 6.5 입력 캡처
```jsx
// 마우스 이벤트 전달
<canvas
  onMouseMove={(e) => ws.send({ type: 'mousemove', x: e.offsetX, y: e.offsetY })}
  onClick={(e) => ws.send({ type: 'click', x: e.offsetX, y: e.offsetY })}
  onWheel={(e) => ws.send({ type: 'scroll', deltaY: e.deltaY })}
/>

// 키보드 이벤트
useEffect(() => {
  window.addEventListener('keydown', handleKeyDown);
}, []);
```

### Phase 3: 통합 및 UI (1시간)

#### 6.8 세션 관리
- 동시 세션 제한 (로컬 데모용: 1개)
- 타임아웃 설정 (5분)
- 세션 종료 시 브라우저 정리

#### 6.9 UI 구성 (위험도 상단, 샌드박스 하단)
```
┌─────────────────────────────────────────────────────────────┐
│  🔒 Safe-Link Live Sandbox                                  │
├─────────────────────────────────────────────────────────────┤
│  URL: [https://example.com                    ] [접속]      │
├─────────────────────────────────────────────────────────────┤
│  🔄 AI 분석 중...                    ← 초기 상태            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         ▼ (2-3초 후 자동 업데이트)                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ⚠️ 위험도: 65점 (주의)              ← AI 분석 결과         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📝 요약: 네이버 로그인 페이지 위조 의심              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 🔍 소스코드 분석:                                    │   │
│  │    • 숨겨진 필드 3개 발견                            │   │
│  │    • 외부 스크립트 5개 로드                          │   │
│  │    • 의심 패턴: eval(), document.write              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 👁️ 시각적 분석:                                      │   │
│  │    • 비밀번호 필드 → 외부 서버 전송 의심             │   │
│  │    • 네이버 로고 위조 가능성                         │   │
│  │    • 긴급 문구로 사용자 압박                         │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 💡 권장사항:                                         │   │
│  │    • 개인정보 입력 금지                              │   │
│  │    • 공식 사이트 주소 확인                           │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │                                                       │  │
│  │              [실시간 샌드박스 화면]                   │  │
│  │              (Canvas - 마우스/키보드 조작 가능)       │  │
│  │                                                       │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  [세션 종료]                                                │
└─────────────────────────────────────────────────────────────┘
```

### 레이아웃 장점

| 위치 | 이유 |
|------|------|
| **위험도 상단** | 경고 먼저 확인 후 탐색 결정 |
| **샌드박스 하단** | 경고 보면서 안전하게 조작 |
| **실시간 업데이트** | 페이지 이동 시 자동 재분석 |

---

## 7. 파일 구조

```
safe-link-sandbox/
├── server.js                 # 기존 REST API
├── analyzer.js               # 기존 휴리스틱 분석
├── ai-analyzer.js            # 기존 AI 분석 (확장)
│
├── sandbox-server.js         # 🆕 WebSocket 샌드박스 서버
├── sandbox-session.js        # 🆕 세션 관리 클래스
├── live-analyzer.js          # 🆕 실시간 멀티모달 분석
│
└── frontend/                 # 🆕 React 프론트엔드
    ├── package.json
    ├── public/
    │   └── index.html
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── RiskPanel.jsx        # 🔝 위험도 표시 (상단)
        │   │   ├── RiskSummary.jsx      # 요약 + 점수
        │   │   ├── CodeFindings.jsx     # 소스코드 분석 결과
        │   │   ├── VisualFindings.jsx   # 시각적 분석 결과
        │   │   └── Recommendations.jsx  # 권장사항
        │   ├── SandboxViewer.jsx    # 🔽 Canvas 뷰어 (하단)
        │   └── UrlInput.jsx         # URL 입력
        └── hooks/
            ├── useSandbox.js        # WebSocket 연결
            └── useAnalysis.js       # 🆕 분석 상태 관리
```

---

## 8. 보안 고려사항

| 위협 | 대응 |
|------|------|
| 악성 JS 실행 | Puppeteer 샌드박스 격리 |
| 로컬 네트워크 접근 | URL 필터링 (127.0.0.1, 192.168.x.x 차단) |
| 무한 리다이렉트 | 최대 5회 제한 |
| 리소스 고갈 | 세션 타임아웃 5분 |
| 파일 다운로드 | 다운로드 차단 설정 |

---

## 9. 성능 최적화

| 항목 | 설정 | 이유 |
|------|------|------|
| 프레임 품질 | JPEG 80% | 대역폭 vs 화질 균형 |
| 해상도 | 1280x720 | 데모용 적정 크기 |
| 프레임레이트 | ~15-30fps | 부드러운 조작감 |
| 입력 쓰로틀링 | mousemove 50ms | 불필요한 이벤트 감소 |

---

## 10. 구현 일정

| 단계 | 작업 | 예상 시간 |
|------|------|----------|
| 1 | WebSocket 서버 + Screencast | 1.5시간 |
| 2 | 입력 이벤트 처리 | 0.5시간 |
| 3 | 비동기 AI 분석 통합 | 1시간 |
| 4 | 소스코드 수집 + 멀티모달 분석 | 0.5시간 |
| 5 | React Canvas 뷰어 | 1시간 |
| 6 | 위험도 패널 (상단) | 1시간 |
| 7 | 입력 캡처 + 전달 | 0.5시간 |
| 8 | UI 통합 + 스타일링 | 0.5시간 |
| 9 | 테스트 + 디버깅 | 0.5시간 |
| **총합** | | **7시간** |

### 우선순위별 구현

| 우선순위 | 기능 | 필수 여부 |
|----------|------|----------|
| P0 | 샌드박스 화면 스트리밍 | 필수 |
| P0 | 마우스/키보드 입력 | 필수 |
| P0 | AI 멀티모달 분석 | 필수 |
| P1 | 비동기 분석 (즉시 접속) | 권장 |
| P1 | 페이지 이동 시 재분석 | 권장 |
| P2 | 분석 결과 세부 표시 | 선택 |

---

## 11. 테스트 시나리오

### 시나리오 1: 정상 사이트 탐색
1. `https://google.com` 입력
2. 검색창 클릭 → 텍스트 입력
3. 검색 결과 확인

### 시나리오 2: 피싱 사이트 탐색
1. 의심 URL 입력
2. 로그인 폼 확인 (입력하지 않음)
3. 위험도 패널에서 경고 확인

### 시나리오 3: 리다이렉트 추적
1. 단축 URL 입력
2. 리다이렉트 과정 실시간 확인
3. 최종 도착지 분석

---

## 12. AI 분석 상세

### 멀티모달 분석 장점

| 분석 대상 | 소스코드 | 스크린샷 | 결합 시 |
|-----------|:--------:|:--------:|:-------:|
| 숨겨진 악성 코드 | ✅ | ❌ | ✅ |
| 가짜 로고/브랜드 위조 | △ | ✅ | ✅ |
| 공포 유발 문구 | ✅ | ✅ | ✅✅ |
| 폼 → 외부 전송 | ✅ | ❌ | ✅ |
| UI 위장 (은행 사칭) | ❌ | ✅ | ✅ |

### 분석 프롬프트 구조
```javascript
const analysisPrompt = `
웹페이지 보안 분석을 수행하세요.

[URL]: ${url}
[HTML 소스]: ${html.substring(0, 15000)}
[폼 정보]: ${JSON.stringify(forms)}
[외부 스크립트]: ${scripts.filter(s => s.src).map(s => s.src)}
[스크린샷]: (이미지 첨부)

분석 항목:
1. 피싱 가능성 (로고 위조, 도메인 사칭)
2. 악성 스크립트 (eval, document.write, keylogger)
3. 폼 보안 (외부 서버 전송, 숨겨진 필드)
4. 시각적 위협 (공포 유발 문구, 가짜 보안 배지)

JSON 형식으로 응답하세요.
`;
```

---

## 13. 확장 가능성

- [ ] 녹화 기능 (세션 리플레이)
- [ ] 네트워크 요청 실시간 모니터링
- [ ] DOM 인스펙터
- [ ] 쿠키/스토리지 뷰어
- [ ] 멀티 세션 지원
- [ ] AI 대화형 분석 ("이 버튼 누르면 어떻게 돼?")

---

**작성일**: 2026-02-02
**버전**: Live Sandbox 2.0.0
**변경사항**:
- AI 멀티모달 분석 추가 (소스코드 + 스크린샷)
- 비동기 분석 (즉시 접속, 백그라운드 분석)
- UI 레이아웃 변경 (위험도 상단, 샌드박스 하단)
- 페이지 이동 시 자동 재분석
