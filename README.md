# Safe-Link Sandbox

URL 안전성 분석 샌드박스 - AI 기반 피싱/스캠 탐지 + **실시간 브라우저 스트리밍**

## 개요

Safe-Link Sandbox는 의심스러운 URL을 안전한 서버 환경에서 분석하여 피싱, 스캠, 악성코드 위험을 탐지하는 서비스입니다.

### 주요 기능

- **🖥️ Live Sandbox**: 실시간 브라우저 화면 스트리밍 (마우스/키보드 조작 가능)
- **🤖 AI 멀티모달 분석**: 소스코드 + 스크린샷 동시 분석 (Gemini 3 Flash)
- **⚡ 비동기 분석**: 즉시 접속, 백그라운드에서 AI 분석 후 결과 표시
- **📊 위험도 점수화**: 0-100 점수로 위험 수준 평가
- **🔒 완전 격리**: 악성 사이트가 사용자 PC에 접근 불가

## 설치

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일에 OPENROUTER_API_KEY 추가
```

## 환경 변수

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `OPENROUTER_API_KEY` | O | OpenRouter API 키 ([발급](https://openrouter.ai/keys)) |
| `PORT` | X | 서버 포트 (기본: 4000) |
| `CORS_ORIGIN` | X | CORS 허용 origin (기본: *) |
| `NODE_ENV` | X | 실행 환경 (기본: development) |

## 실행

### Live Sandbox (실시간 브라우저)

```bash
# 백엔드: Live Sandbox 서버
npm run sandbox:dev

# 프론트엔드: React UI
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

## Live Sandbox 사용법

1. 프론트엔드 접속 (`http://localhost:5173`)
2. URL 입력 후 "접속" 클릭
3. 실시간 브라우저 화면에서 마우스/키보드로 탐색
4. 상단 위험도 패널에서 AI 분석 결과 확인

### WebSocket 프로토콜

```javascript
// 연결
const ws = new WebSocket('ws://localhost:4000/sandbox');

// 세션 시작
ws.send(JSON.stringify({ type: 'start', url: 'https://example.com' }));

// 마우스 클릭
ws.send(JSON.stringify({ type: 'click', x: 100, y: 200 }));

// 서버 → 클라이언트: 프레임
{ type: 'frame', data: 'base64-jpeg...' }

// 서버 → 클라이언트: AI 분석 완료
{ type: 'analysis_complete', riskScore: 65, riskLevel: 'warning', ... }
```

## API 엔드포인트

### GET /health
서버 상태 확인

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

**요청:**
```json
{
  "url": "https://example.com"
}
```

### POST /api/batch-check
여러 URL 일괄 검사

**요청:**
```json
{
  "urls": ["https://example1.com", "https://example2.com"]
}
```

## 위험도 수준

| 점수 | 레벨 | 설명 |
|------|------|------|
| 0-30 | `safe` | 안전 |
| 31-70 | `warning` | 주의 필요 |
| 71-100 | `danger` | 위험 |

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

## 기술 스택

- **Runtime**: Node.js 20+
- **Backend**: Express.js, WebSocket (ws)
- **Browser**: Puppeteer (CDP Screencast)
- **Frontend**: React, Canvas API
- **AI**: OpenRouter API (Gemini 3 Flash)
- **Security**: Helmet, Rate Limiting, URL 필터링

## 프로젝트 구조

```
safe-link-sandbox/
├── server.js              # REST API 서버
├── sandbox-server.js      # Live Sandbox WebSocket 서버
├── sandbox-session.js     # 세션 관리 클래스
├── live-analyzer.js       # 실시간 AI 분석 모듈
├── analyzer.js            # 휴리스틱 분석
├── ai-analyzer.js         # AI 분석 (기본)
│
└── frontend/              # React 프론트엔드
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── RiskPanel/     # 위험도 패널
        │   ├── SandboxViewer.jsx  # Canvas 뷰어
        │   └── UrlInput.jsx
        └── hooks/
            └── useSandbox.js  # WebSocket 훅
```

## 라이선스

MIT
