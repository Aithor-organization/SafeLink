# Safe-Link Sandbox

URL 안전성 분석 샌드박스 - AI 기반 피싱/스캠 탐지 + **실시간 브라우저 스트리밍**

## 개요

Safe-Link Sandbox는 의심스러운 URL을 안전한 서버 환경에서 분석하여 피싱, 스캠, 악성코드 위험을 탐지하는 서비스입니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| 🖥️ **Live Sandbox** | 실시간 브라우저 화면 스트리밍 (마우스/키보드 조작 가능) |
| 🤖 **AI 멀티모달 분석** | 소스코드 + 스크린샷 동시 분석 (Gemini 3 Flash) |
| 🚫 **다운로드 차단** | 모든 파일 다운로드 완전 차단 + 위험도 분석 |
| 🧭 **네비게이션 컨트롤** | 뒤로가기/앞으로가기/새로고침 지원 |
| 📱 **반응형 UI** | 데스크톱/태블릿/모바일 지원 |
| ⚡ **비동기 분석** | 즉시 접속, 백그라운드에서 AI 분석 후 결과 표시 |
| 📊 **위험도 점수화** | 0-100 점수로 위험 수준 평가 |
| 🔒 **완전 격리** | 악성 사이트가 사용자 PC에 접근 불가 |

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 브라우저                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  URL 입력   │  │ 네비게이션   │  │     Canvas 뷰어        │  │
│  │  컴포넌트   │  │  ← → 🔄     │  │  (실시간 스트리밍)      │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│                    WebSocket                                     │
│                     (양방향)                                      │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Sandbox Server (Port 4000)                    │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │ Session Manager│  │ Input Handler  │  │ Download Blocker │   │
│  │ (동시 세션 제한)│  │ (마우스/키보드) │  │ (파일 다운로드   │   │
│  │                │  │                │  │  완전 차단)      │   │
│  └───────┬────────┘  └───────┬────────┘  └────────┬─────────┘   │
│          │                   │                     │             │
│          └───────────────────┼─────────────────────┘             │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Puppeteer Browser                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │  │
│  │  │ CDP Screen  │  │  Page Nav   │  │   URL Filter    │    │  │
│  │  │   cast      │  │  Detection  │  │  (SSRF 방지)    │    │  │
│  │  │ (JPEG 80%)  │  │             │  │                 │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Live Analyzer                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │  │
│  │  │ Screenshot  │  │    HTML     │  │  OpenRouter API │    │  │
│  │  │  Capture    │  │   Extract   │  │ (Gemini 3 Flash)│    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## 보안 기능

### 다운로드 차단
- **완전 차단**: `Browser.setDownloadBehavior: 'deny'` - 어떤 파일도 기기에 다운로드 불가
- **위험 파일 탐지**: `.exe`, `.msi`, `.bat`, `.cmd`, `.scr`, `.app`, `.dmg`, `.sh` 등
- **이중 확장자 탐지**: `invoice.pdf.exe` 같은 위장 파일 감지
- **MIME 불일치 탐지**: Content-Type과 확장자 불일치 확인

### 네트워크 보안
- **SSRF 방지**: 내부 네트워크 IP 차단 (127.x, 192.168.x, 10.x, 172.16-31.x)
- **리다이렉트 제한**: 최대 5회 리다이렉트 허용
- **프로토콜 제한**: HTTP/HTTPS만 허용

### 세션 보안
- **타임아웃**: 5분 후 자동 세션 종료
- **동시 세션 제한**: 최대 1개 (로컬 데모 기준)
- **UUID 세션 ID**: 예측 불가능한 세션 식별자

## 설치

```bash
# 의존성 설치
npm install

# 프론트엔드 의존성 설치
cd frontend && npm install && cd ..

# 환경 변수 설정
cp .env.example .env
# .env 파일에 OPENROUTER_API_KEY 추가
```

## 환경 변수

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `OPENROUTER_API_KEY` | O | OpenRouter API 키 ([발급](https://openrouter.ai/keys)) |
| `SANDBOX_PORT` | X | 샌드박스 서버 포트 (기본: 4000) |
| `MAX_SESSIONS` | X | 최대 동시 세션 수 (기본: 1) |
| `PORT` | X | REST API 서버 포트 (기본: 3000) |
| `NODE_ENV` | X | 실행 환경 (기본: development) |

## 실행

### Live Sandbox (실시간 브라우저)

```bash
# 터미널 1: 백엔드 서버
node sandbox-server.js

# 터미널 2: 프론트엔드
cd frontend && npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### REST API 서버

```bash
# 개발 모드 (자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

## 사용법

### Live Sandbox

1. 프론트엔드 접속 (`http://localhost:5173`)
2. URL 입력 후 "접속" 클릭
3. 실시간 브라우저 화면에서 마우스/키보드로 탐색
4. **네비게이션 버튼**: ← (뒤로), → (앞으로), 🔄 (새로고침)
5. 상단 요약 바에서 AI 분석 결과 확인
6. "▼ 상세" 클릭하여 상세 분석 결과 확인

### WebSocket 프로토콜

```javascript
// 연결
const ws = new WebSocket('ws://localhost:4000/sandbox');

// 세션 시작
ws.send(JSON.stringify({ type: 'start', url: 'https://example.com' }));

// 마우스 클릭
ws.send(JSON.stringify({ type: 'click', x: 100, y: 200 }));

// 네비게이션
ws.send(JSON.stringify({ type: 'goBack' }));
ws.send(JSON.stringify({ type: 'goForward' }));
ws.send(JSON.stringify({ type: 'reload' }));

// 서버 → 클라이언트: 프레임
{ type: 'frame', data: 'base64-jpeg...' }

// 서버 → 클라이언트: AI 분석 완료
{ type: 'analysis_complete', riskScore: 65, riskLevel: 'warning', ... }

// 서버 → 클라이언트: 다운로드 차단
{ type: 'download_blocked', filename: 'malware.exe', riskScore: 85, ... }
```

## API 엔드포인트

### GET /health
서버 상태 확인

### GET /sessions
현재 세션 정보 조회

### POST /api/analyze
URL 전체 분석 (샌드박스 + AI)

**요청:**
```json
{
  "url": "https://example.com",
  "options": {
    "timeout": 30000,
    "takeScreenshot": true,
    "useAI": true
  }
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "riskScore": 25,
    "riskLevel": "safe",
    "screenshot": "base64...",
    "details": {
      "domain": { "score": 0, "issues": [] },
      "content": { "score": 15, "issues": ["비밀번호 입력 필드 존재"] },
      "network": { "score": 10, "issues": [] }
    },
    "aiAnalysis": {
      "enabled": true,
      "model": "google/gemini-3-flash-preview",
      "score": 20,
      "summary": "안전한 사이트로 판단됩니다.",
      "findings": [...],
      "recommendations": [...],
      "confidence": 85
    }
  }
}
```

### POST /api/quick-check
빠른 도메인 검사 (브라우저 미사용)

### POST /api/batch-check
여러 URL 일괄 검사

## 위험도 수준

| 점수 | 레벨 | 설명 | 색상 |
|------|------|------|------|
| 0-30 | `safe` | 안전 | 🟢 초록 |
| 31-70 | `warning` | 주의 필요 | 🟡 노랑 |
| 71-100 | `danger` | 위험 | 🔴 빨강 |

## 분석 항목

### 휴리스틱 분석
- **도메인**: IP 접근, 무료 도메인, HTTPS 미사용
- **콘텐츠**: 피싱 문구, 비밀번호 필드, 외부 폼 전송
- **네트워크**: 외부 도메인 요청, 외부 스크립트 로드

### AI 분석 (Gemini 3 Flash)
- 피싱 패턴 인식
- 스캠 문구 탐지
- 시각적 위험 요소 분석
- 종합 위험도 평가

### 다운로드 분석
- 파일 확장자 위험도
- 이중 확장자 탐지
- MIME 타입 불일치 감지

## 기술 스택

### Backend
| 기술 | 용도 |
|------|------|
| Node.js 20+ | 런타임 |
| Express.js | REST API 서버 |
| WebSocket (ws) | 실시간 양방향 통신 |
| Puppeteer | 헤드리스 브라우저 제어 |
| CDP (Chrome DevTools Protocol) | Screencast 스트리밍 |

### Frontend
| 기술 | 용도 |
|------|------|
| React 18 | UI 프레임워크 |
| Vite | 빌드 도구 |
| Canvas API | 실시간 프레임 렌더링 |
| CSS3 Media Queries | 반응형 디자인 |

### AI & Security
| 기술 | 용도 |
|------|------|
| OpenRouter API | AI 모델 게이트웨이 |
| Gemini 3 Flash | 멀티모달 분석 (코드 + 이미지) |
| Helmet | HTTP 보안 헤더 |
| Rate Limiting | API 요청 제한 |

## 프로젝트 구조

```
safe-link-sandbox/
├── sandbox-server.js      # Live Sandbox WebSocket 서버
├── sandbox-session.js     # 세션 관리 + 다운로드 차단
├── live-analyzer.js       # 실시간 AI 분석 모듈
├── server.js              # REST API 서버
├── analyzer.js            # 휴리스틱 분석
├── ai-analyzer.js         # AI 분석 (기본)
│
├── frontend/              # React 프론트엔드
│   ├── src/
│   │   ├── App.jsx        # 메인 앱 (레이아웃)
│   │   ├── App.css        # 반응형 스타일
│   │   ├── components/
│   │   │   ├── RiskPanel/       # 위험도 상세 패널
│   │   │   ├── SandboxViewer.jsx # Canvas 뷰어
│   │   │   └── UrlInput.jsx     # URL 입력 폼
│   │   └── hooks/
│   │       └── useSandbox.js    # WebSocket 훅
│   └── package.json
│
├── .env.example           # 환경 변수 템플릿
└── package.json
```

## 반응형 디자인

| 화면 크기 | 브레이크포인트 | 레이아웃 |
|-----------|----------------|----------|
| 데스크톱 | > 768px | 가로 배치, 큰 캔버스 (70vh) |
| 태블릿 | 480-768px | 세로 배치, 중간 캔버스 (50vh) |
| 모바일 | < 480px | 세로 배치, 작은 캔버스 (40vh) |

## 데모 스크린샷

```
┌─────────────────────────────────────────────────────────────┐
│  🔒 Safe-Link Sandbox                                       │
│  의심스러운 링크를 안전하게 검사하세요                         │
├─────────────────────────────────────────────────────────────┤
│  [🔗 URL을 입력하세요...                    ] [접속]         │
│                                                             │
│  [←] [→] [🔄]    🟢 연결됨                    [세션 종료]    │
├─────────────────────────────────────────────────────────────┤
│  ⚠️ 위험도 45점  일부 주의가 필요한 요소가 발견됨  [▼ 상세]  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │              (실시간 브라우저 화면)                   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Safe-Link Sandbox - 링크 안전 검사 도구                     │
└─────────────────────────────────────────────────────────────┘
```

## 라이선스

MIT
