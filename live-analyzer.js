/**
 * Live Multimodal AI Analysis Module
 * 실시간 멀티모달 AI 분석 모듈
 *
 * 소스코드 + 스크린샷 멀티모달 분석
 * 비동기 분석 (즉시 반환, 결과는 WebSocket으로 전송)
 */

// OpenRouter API 설정
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = 'google/gemini-3-flash-preview';

// 분석 타임아웃 설정 (초 단위)
const ANALYSIS_TIMEOUT = 60000; // 60초

// ============================================
// 리다이렉트 감지 함수
// ============================================

/**
 * URL 리다이렉트 감지 및 분석
 * @param {string} originalUrl - 사용자가 입력한 원래 URL
 * @param {string} currentUrl - 최종 도착한 URL
 * @returns {Object} 리다이렉트 정보
 */
function detectRedirect(originalUrl, currentUrl) {
  // URL 정규화
  const normalizeUrl = (url) => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return {
        full: parsed.href,
        hostname: parsed.hostname.toLowerCase(),
        pathname: parsed.pathname,
      };
    } catch {
      return { full: url, hostname: url, pathname: '/' };
    }
  };

  const original = normalizeUrl(originalUrl);
  const current = normalizeUrl(currentUrl);

  // 리다이렉트 여부 확인
  const redirected = original.hostname !== current.hostname;

  // 타이포스쿼팅 감지 (예: amaz0n → amazon)
  const typosquatting = detectTyposquatting(original.hostname, current.hostname);

  // 도메인 유사도 분석
  const domainSimilarity = calculateSimilarity(original.hostname, current.hostname);

  return {
    redirected,
    originalUrl: original.full,
    currentUrl: current.full,
    originalDomain: original.hostname,
    currentDomain: current.hostname,
    typosquatting,
    domainSimilarity,
    explanation: generateRedirectExplanation(original, current, typosquatting),
  };
}

/**
 * 타이포스쿼팅 패턴 감지
 * @param {string} original - 원래 도메인
 * @param {string} target - 최종 도메인
 * @returns {Object} 타이포스쿼팅 정보
 */
function detectTyposquatting(original, target) {
  // 숫자-문자 치환 패턴 (0↔o, 1↔l, 3↔e, 5↔s 등)
  const leetPatterns = {
    '0': 'o', 'o': '0',
    '1': 'l', 'l': '1', 'i': '1',
    '3': 'e', 'e': '3',
    '5': 's', 's': '5',
    '4': 'a', 'a': '4',
    '7': 't', 't': '7',
    '8': 'b', 'b': '8',
  };

  // 원래 도메인을 정규화하여 비교
  const normalizeForComparison = (domain) => {
    let normalized = domain.toLowerCase();
    for (const [key, value] of Object.entries(leetPatterns)) {
      normalized = normalized.replace(new RegExp(key, 'g'), value);
    }
    return normalized.replace(/[^a-z]/g, '');
  };

  const normalizedOriginal = normalizeForComparison(original);
  const normalizedTarget = normalizeForComparison(target);

  // 숫자 사용 감지
  const hasNumbers = /\d/.test(original);
  const numbersUsed = original.match(/\d/g) || [];

  // 의심스러운 치환 감지
  const suspiciousSubstitutions = [];
  for (let i = 0; i < original.length; i++) {
    const char = original[i];
    if (leetPatterns[char]) {
      suspiciousSubstitutions.push({
        position: i,
        original: char,
        looksLike: leetPatterns[char],
      });
    }
  }

  const isTyposquatting = hasNumbers && normalizedOriginal === normalizedTarget;

  return {
    detected: isTyposquatting,
    hasNumbers,
    numbersUsed,
    suspiciousSubstitutions,
    normalizedMatch: normalizedOriginal === normalizedTarget,
  };
}

/**
 * 두 문자열의 유사도 계산 (Levenshtein 기반)
 */
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * 리다이렉트 설명 생성
 */
function generateRedirectExplanation(original, current, typosquatting) {
  if (!typosquatting.detected && original.hostname === current.hostname) {
    return null;
  }

  const explanations = [];

  if (typosquatting.detected) {
    const substitutions = typosquatting.suspiciousSubstitutions
      .map(s => `"${s.original}"가 "${s.looksLike}"처럼 보임`)
      .join(', ');

    explanations.push(
      `⚠️ 주의: 입력하신 주소(${original.hostname})에서 숫자가 문자처럼 사용되었습니다 (${substitutions}).`,
      `이것은 "타이포스쿼팅"이라는 피싱 기법일 수 있습니다.`,
      `다행히 이 주소는 공식 사이트(${current.hostname})로 자동 이동되었습니다.`
    );
  } else if (original.hostname !== current.hostname) {
    explanations.push(
      `ℹ️ 리다이렉트 발생: ${original.hostname} → ${current.hostname}`,
      `입력한 주소에서 다른 주소로 자동 이동되었습니다.`
    );
  }

  return explanations.join(' ');
}

// ============================================
// 데이터 수집 함수
// ============================================

/**
 * 페이지에서 분석에 필요한 모든 데이터 수집
 * @param {import('puppeteer').Page} page - Puppeteer 페이지 객체
 * @returns {Promise<Object>} 수집된 분석 데이터
 */
export async function collectAnalysisData(page) {
  const [screenshot, html, forms, scripts] = await Promise.all([
    captureScreenshot(page),
    page.content(),
    getFormInfo(page),
    getScriptInfo(page),
  ]);

  return {
    screenshot,
    html,
    forms,
    scripts,
    url: page.url(),
    title: await page.title().catch(() => ''),
    timestamp: new Date().toISOString(),
  };
}

/**
 * 스크린샷 캡처 (에러 핸들링 포함)
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string|null>} Base64 인코딩된 스크린샷
 */
async function captureScreenshot(page) {
  try {
    return await page.screenshot({ encoding: 'base64' });
  } catch (error) {
    console.warn('[Live Analyzer] 스크린샷 캡처 실패:', error.message);
    return null;
  }
}

/**
 * 페이지의 모든 폼 정보 추출
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Array>} 폼 정보 배열
 */
export async function getFormInfo(page) {
  try {
    return await page.evaluate(() => {
      return [...document.forms].map(form => ({
        action: form.action || '',
        method: (form.method || 'GET').toUpperCase(),
        id: form.id || null,
        name: form.name || null,
        fields: [...form.elements].map(element => ({
          name: element.name || null,
          type: element.type || 'text',
          id: element.id || null,
          required: element.required || false,
          placeholder: element.placeholder || null,
          // 민감한 필드 감지
          isSensitive: ['password', 'email', 'tel', 'credit-card'].some(
            t => element.type?.includes(t) ||
                 element.name?.toLowerCase().includes(t) ||
                 element.id?.toLowerCase().includes(t)
          ),
        })),
        // 외부 서버로 전송하는지 확인
        isExternalAction: (() => {
          const action = form.action || '';
          if (!action || action === '#' || action === '') return false;
          try {
            const actionUrl = new URL(action, window.location.href);
            return actionUrl.hostname !== window.location.hostname;
          } catch {
            return false;
          }
        })(),
      }));
    });
  } catch (error) {
    console.warn('[Live Analyzer] 폼 정보 추출 실패:', error.message);
    return [];
  }
}

/**
 * 페이지의 모든 스크립트 정보 추출
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Array>} 스크립트 정보 배열
 */
export async function getScriptInfo(page) {
  try {
    return await page.evaluate(() => {
      return [...document.scripts].map(script => ({
        src: script.src || null,
        isExternal: !!script.src,
        // 인라인 스크립트는 처음 1000자만 수집 (보안상)
        content: script.src ? null : (script.textContent?.substring(0, 1000) || null),
        type: script.type || 'text/javascript',
        async: script.async,
        defer: script.defer,
        // 외부 스크립트의 도메인 추출
        domain: (() => {
          if (!script.src) return null;
          try {
            return new URL(script.src).hostname;
          } catch {
            return null;
          }
        })(),
      }));
    });
  } catch (error) {
    console.warn('[Live Analyzer] 스크립트 정보 추출 실패:', error.message);
    return [];
  }
}

/**
 * 추가 메타 정보 수집
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object>}
 */
export async function getMetaInfo(page) {
  try {
    return await page.evaluate(() => {
      const metas = [...document.querySelectorAll('meta')];
      const links = [...document.querySelectorAll('link')];

      return {
        // 메타 태그 정보
        meta: metas.map(m => ({
          name: m.name || m.getAttribute('property') || null,
          content: m.content || null,
        })).filter(m => m.name),

        // 파비콘 및 외부 리소스
        externalResources: links
          .filter(l => l.href && !l.href.includes(window.location.hostname))
          .map(l => ({
            rel: l.rel,
            href: l.href,
          })),

        // 페이지 특성
        hasIframes: document.querySelectorAll('iframe').length > 0,
        iframeCount: document.querySelectorAll('iframe').length,
        hasPopups: !!document.querySelector('[onclick*="window.open"]'),

        // 의심스러운 요소
        hasHiddenInputs: document.querySelectorAll('input[type="hidden"]').length > 0,
        hiddenInputCount: document.querySelectorAll('input[type="hidden"]').length,

        // 긴급성 문구 감지
        urgencyKeywords: (() => {
          const text = document.body?.innerText?.toLowerCase() || '';
          const keywords = [
            'urgent', 'immediately', 'expire', 'suspended', 'verify now',
            'act now', 'limited time', 'your account', 'confirm identity',
            '긴급', '즉시', '만료', '정지', '지금 확인', '계정', '본인 확인',
          ];
          return keywords.filter(k => text.includes(k));
        })(),
      };
    });
  } catch (error) {
    console.warn('[Live Analyzer] 메타 정보 추출 실패:', error.message);
    return {};
  }
}

// ============================================
// 멀티모달 AI 분석
// ============================================

/**
 * 리다이렉트 정보 섹션 생성
 * @param {Object} redirectInfo - 리다이렉트 정보
 * @returns {string} 리다이렉트 섹션 텍스트
 */
function buildRedirectSection(redirectInfo) {
  if (!redirectInfo || !redirectInfo.redirected) {
    return '';
  }

  let section = `
### ⚠️ 리다이렉트 감지됨
- **원래 입력 URL**: ${redirectInfo.originalUrl}
- **최종 도착 URL**: ${redirectInfo.currentUrl}
- **원래 도메인**: ${redirectInfo.originalDomain}
- **최종 도메인**: ${redirectInfo.currentDomain}`;

  if (redirectInfo.typosquatting && redirectInfo.typosquatting.detected) {
    section += `
- **타이포스쿼팅 의심**: 예 (숫자가 문자처럼 사용됨)
- **사용된 숫자**: ${redirectInfo.typosquatting.numbersUsed.join(', ')}`;
  }

  section += `

**중요**: 이 리다이렉트가 왜 발생했는지, 그리고 이것이 안전한지 위험한지 반드시 설명해주세요.
- 타이포스쿼팅(예: amaz0n.com → amazon.com)인 경우, 공식 사이트가 오타 도메인을 보호 목적으로 소유한 것인지 설명
- 피싱 사이트가 정보 수집 후 공식 사이트로 리다이렉트하는 것인지 설명
- 일반인이 이해할 수 있도록 "왜 이런 일이 발생했는지" 친절하게 설명`;

  return section;
}

/**
 * 멀티모달 분석 프롬프트 생성
 * @param {Object} data - 수집된 분석 데이터
 * @param {Object} redirectInfo - 리다이렉트 정보
 * @returns {string} 분석 프롬프트
 */
function buildMultimodalPrompt(data, redirectInfo = null) {
  const { url, html, forms, scripts, title } = data;

  // HTML 요약 (토큰 절약을 위해 중요 부분만)
  const htmlSummary = summarizeHtml(html);

  // 폼 분석 요약
  const formsSummary = summarizeForms(forms);

  // 스크립트 분석 요약
  const scriptsSummary = summarizeScripts(scripts);

  // 리다이렉트 섹션
  const redirectSection = buildRedirectSection(redirectInfo);

  return `당신은 사이버 보안 전문가이자 일반인을 위한 보안 교육자입니다.
다음 웹페이지를 분석하여 피싱, 스캠, 악성코드 위험도를 평가해주세요.

**중요**: 모든 분석 결과는 **비개발자인 일반인**도 쉽게 이해할 수 있도록 한국어로 친절하게 설명해주세요.
전문 용어를 사용할 때는 반드시 쉬운 설명을 함께 제공하세요.

## 분석 대상 정보

**현재 URL**: ${url}
**페이지 제목**: ${title || '없음'}
${redirectSection}

### HTML 구조 분석
${htmlSummary}

### 폼 분석
${formsSummary}

### 스크립트 분석
${scriptsSummary}

## 분석 지침

### 1. 소스코드 분석 (위 텍스트 정보 기반)
- 입력 폼: 비밀번호, 카드번호, 개인정보를 입력받는 칸이 있는지
- 데이터 전송: 입력한 정보가 어디로 전송되는지 (외부 서버로 전송되면 위험)
- 숨겨진 정보: 사용자 모르게 수집되는 정보가 있는지
- 의심 코드: 키보드 입력 감시, 자동 이동, 암호화된 코드 등

### 2. 스크린샷 분석 (제공된 이미지 기반)
- 로고 위조: 네이버, 카카오, 은행 로고를 흉내 냈는지
- 공포 유발 문구: "계정 정지", "즉시 조치", "48시간 내" 같은 협박성 문구
- 가짜 보안 마크: 진짜처럼 보이는 가짜 인증 마크나 자물쇠 아이콘
- 디자인 품질: 조잡한 디자인, 오타, 어색한 한국어 번역

### 3. 종합 판정
위 분석을 종합하여 최종 위험도 판정

## 응답 형식 (반드시 JSON)
{
  "riskScore": 0-100 사이의 숫자,
  "riskLevel": "safe" | "warning" | "danger",
  "summary": "한 문장으로 위험 요약 (일반인도 이해하기 쉽게)",
  "findings": [
    {
      "category": "phishing" | "scam" | "malware" | "suspicious" | "safe",
      "severity": "low" | "medium" | "high",
      "title": "발견된 문제 제목 (간단명료하게)",
      "description": "이것이 왜 위험한지 일반인도 이해할 수 있게 자세히 설명. 예: '이 사이트는 당신이 입력한 비밀번호를 외부 서버로 몰래 전송합니다. 이는 해커가 당신의 계정을 훔치려는 것일 수 있습니다.'"
    }
  ],
  "codeAnalysis": {
    "hiddenFields": 숨겨진 필드 수,
    "externalScripts": 외부 스크립트 수,
    "suspiciousPatterns": ["발견된 의심 패턴 목록"],
    "explanation": "소스코드에서 발견된 내용을 일반인이 이해할 수 있게 설명. 예: '이 사이트의 코드를 분석한 결과, 여러분이 키보드로 입력하는 모든 내용을 몰래 기록하는 프로그램이 숨어있습니다. 이것은 비밀번호나 카드번호를 훔치려는 악성 코드입니다.'"
  },
  "visualAnalysis": {
    "brandImitation": true | false,
    "urgencyTactics": true | false,
    "fakeSecurityBadges": true | false,
    "description": "화면에서 발견된 내용을 일반인이 이해할 수 있게 설명. 예: '이 사이트는 네이버 로그인 페이지처럼 보이지만, 자세히 보면 로고 품질이 낮고 주소가 다릅니다. 진짜 네이버가 아닌 가짜 사이트입니다.'"
  },
  "redirectAnalysis": {
    "occurred": true | false,
    "originalUrl": "사용자가 입력한 원래 URL (리다이렉트 발생 시에만)",
    "reason": "리다이렉트가 발생한 이유를 일반인이 이해할 수 있게 설명. 예: '입력하신 주소 amaz0n.com에서 숫자 0이 영문자 o 대신 사용되었습니다. 이것은 피싱 사기꾼들이 자주 쓰는 \"타이포스쿼팅\" 기법입니다. 다행히 아마존이 이 주소를 미리 확보해두어 공식 사이트로 자동 연결되었습니다.'",
    "isSafe": true | false,
    "safetyExplanation": "이 리다이렉트가 안전한 이유 또는 위험한 이유 설명"
  },
  "recommendations": [
    "구체적인 행동 지침 1 (예: '이 사이트에서 절대로 비밀번호를 입력하지 마세요')",
    "구체적인 행동 지침 2 (예: '이미 정보를 입력했다면 즉시 해당 계정의 비밀번호를 변경하세요')"
  ],
  "simpleExplanation": "비개발자를 위한 전체 요약 설명. 이 사이트가 왜 안전한지/위험한지를 초등학생도 이해할 수 있는 수준으로 2-3문장으로 설명해주세요. 리다이렉트가 발생한 경우 반드시 이 사실과 이유를 포함해서 설명해주세요.",
  "confidence": 0-100 사이의 분석 신뢰도
}`;
}

/**
 * HTML 요약 생성
 * @param {string} html
 * @returns {string}
 */
function summarizeHtml(html) {
  if (!html) return '- HTML 데이터 없음';

  const summary = [];

  // 제목 태그 추출
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    summary.push(`- 제목: ${titleMatch[1].substring(0, 100)}`);
  }

  // 폼 개수
  const formCount = (html.match(/<form/gi) || []).length;
  summary.push(`- 폼 개수: ${formCount}개`);

  // 비밀번호 필드
  const passwordFields = (html.match(/type=["']?password["']?/gi) || []).length;
  if (passwordFields > 0) {
    summary.push(`- 비밀번호 필드: ${passwordFields}개 (주의)`);
  }

  // 숨겨진 필드
  const hiddenFields = (html.match(/type=["']?hidden["']?/gi) || []).length;
  if (hiddenFields > 5) {
    summary.push(`- 숨겨진 필드: ${hiddenFields}개 (과다)`);
  }

  // 외부 스크립트
  const externalScripts = (html.match(/src=["'][^"']*http/gi) || []).length;
  if (externalScripts > 0) {
    summary.push(`- 외부 스크립트: ${externalScripts}개`);
  }

  // iframe
  const iframes = (html.match(/<iframe/gi) || []).length;
  if (iframes > 0) {
    summary.push(`- iframe: ${iframes}개`);
  }

  return summary.length > 0 ? summary.join('\n') : '- 특이사항 없음';
}

/**
 * 폼 정보 요약
 * @param {Array} forms
 * @returns {string}
 */
function summarizeForms(forms) {
  if (!forms || forms.length === 0) {
    return '- 폼 없음';
  }

  const summary = [`- 총 ${forms.length}개 폼 발견`];

  for (const [index, form] of forms.entries()) {
    const lines = [`\n[폼 ${index + 1}]`];
    lines.push(`  - Action: ${form.action || '(없음)'}`);
    lines.push(`  - Method: ${form.method}`);

    if (form.isExternalAction) {
      lines.push(`  - !! 외부 서버로 전송 !!`);
    }

    const sensitiveFields = form.fields.filter(f => f.isSensitive);
    if (sensitiveFields.length > 0) {
      lines.push(`  - 민감한 필드: ${sensitiveFields.map(f => f.type || f.name).join(', ')}`);
    }

    summary.push(lines.join('\n'));
  }

  return summary.join('\n');
}

/**
 * 스크립트 정보 요약
 * @param {Array} scripts
 * @returns {string}
 */
function summarizeScripts(scripts) {
  if (!scripts || scripts.length === 0) {
    return '- 스크립트 없음';
  }

  const external = scripts.filter(s => s.isExternal);
  const inline = scripts.filter(s => !s.isExternal);

  const summary = [`- 총 ${scripts.length}개 스크립트 (외부: ${external.length}, 인라인: ${inline.length})`];

  // 외부 스크립트 도메인
  const domains = [...new Set(external.map(s => s.domain).filter(Boolean))];
  if (domains.length > 0) {
    summary.push(`- 외부 도메인: ${domains.slice(0, 5).join(', ')}${domains.length > 5 ? ` 외 ${domains.length - 5}개` : ''}`);
  }

  // 인라인 스크립트 의심 패턴
  const suspiciousPatterns = [];
  for (const script of inline) {
    if (!script.content) continue;

    if (/eval\s*\(/.test(script.content)) suspiciousPatterns.push('eval()');
    if (/document\.write/.test(script.content)) suspiciousPatterns.push('document.write');
    if (/window\.location\s*=/.test(script.content)) suspiciousPatterns.push('location redirect');
    if (/fromCharCode/.test(script.content)) suspiciousPatterns.push('fromCharCode');
    if (/btoa|atob/.test(script.content)) suspiciousPatterns.push('Base64 encoding');
    if (/keydown|keypress|keyup/.test(script.content)) suspiciousPatterns.push('keyboard listener');
  }

  if (suspiciousPatterns.length > 0) {
    summary.push(`- !! 의심 패턴: ${[...new Set(suspiciousPatterns)].join(', ')}`);
  }

  return summary.join('\n');
}

/**
 * 멀티모달 AI 분석 실행
 * @param {Object} data - 수집된 분석 데이터
 * @param {Object} redirectInfo - 리다이렉트 정보 (선택)
 * @returns {Promise<Object>} AI 분석 결과
 */
export async function analyzeWithAIMultimodal(data, redirectInfo = null) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.warn('[Live Analyzer] OPENROUTER_API_KEY가 설정되지 않았습니다.');
    return {
      enabled: false,
      reason: 'API 키 미설정',
      riskScore: 50,
      riskLevel: 'warning',
      summary: 'AI 분석 불가 - API 키가 설정되지 않았습니다.',
      findings: [],
      codeAnalysis: {
        hiddenFields: 0,
        externalScripts: 0,
        suspiciousPatterns: [],
      },
      recommendations: ['수동 검토가 필요합니다.'],
      confidence: 0,
      redirectAnalysis: redirectInfo ? {
        occurred: redirectInfo.redirected,
        originalUrl: redirectInfo.originalUrl,
        reason: '분석 불가',
        isSafe: null,
        safetyExplanation: 'AI 분석 없이 판단 불가',
      } : null,
    };
  }

  try {
    const prompt = buildMultimodalPrompt(data, redirectInfo);
    const messages = buildMultimodalMessages(prompt, data.screenshot);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT);

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://safe-link-sandbox.local',
        'X-Title': 'Safe-Link Sandbox Live Analyzer',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        max_tokens: 3000,
        temperature: 0.2, // 더 일관된 분석을 위해 낮춤
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API 오류: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    const content = responseData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('AI 응답이 비어있습니다.');
    }

    const result = parseAIResponse(content);

    return {
      enabled: true,
      model: MODEL_NAME,
      ...result,
      usage: responseData.usage,
    };

  } catch (error) {
    console.error('[Live Analyzer] AI 분석 오류:', error.message);

    // 타임아웃 오류 처리
    if (error.name === 'AbortError') {
      return {
        enabled: false,
        error: '분석 시간 초과',
        riskScore: 50,
        riskLevel: 'warning',
        summary: 'AI 분석 시간 초과',
        findings: [],
        codeAnalysis: { hiddenFields: 0, externalScripts: 0, suspiciousPatterns: [] },
        recommendations: ['수동 검토가 필요합니다.'],
        confidence: 0,
      };
    }

    return {
      enabled: false,
      error: error.message,
      riskScore: 50,
      riskLevel: 'warning',
      summary: `AI 분석 오류: ${error.message}`,
      findings: [],
      codeAnalysis: { hiddenFields: 0, externalScripts: 0, suspiciousPatterns: [] },
      recommendations: ['수동 검토가 필요합니다.'],
      confidence: 0,
    };
  }
}

/**
 * 멀티모달 메시지 배열 생성
 * @param {string} prompt - 텍스트 프롬프트
 * @param {string|null} screenshot - Base64 스크린샷
 * @returns {Array}
 */
function buildMultimodalMessages(prompt, screenshot) {
  const content = [];

  // 텍스트 프롬프트
  content.push({
    type: 'text',
    text: prompt,
  });

  // 스크린샷이 있으면 이미지로 추가
  if (screenshot) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${screenshot}`,
        detail: 'high', // 고해상도 분석
      },
    });
  }

  return [
    {
      role: 'system',
      content: `당신은 사이버 보안 전문가이자 **일반인을 위한 보안 교육자**입니다.
웹사이트의 안전성을 멀티모달 분석(소스코드 + 시각적 분석)을 통해 평가합니다.

## 핵심 원칙
1. 모든 설명은 **비개발자도 이해할 수 있게** 쉬운 한국어로 작성
2. 전문 용어 사용 시 반드시 **쉬운 설명 추가** (예: "키로거(키보드 입력을 몰래 기록하는 프로그램)")
3. 위험한 이유를 **구체적인 예시**와 함께 설명
4. 항상 JSON 형식으로 응답

## 분석 영역
1. **피싱 (가짜 사이트)**: 네이버, 카카오, 은행 사이트를 흉내 낸 가짜 사이트
2. **스캠 (사기)**: 돈이나 개인정보를 빼앗으려는 사기 수법
3. **악성코드**: 컴퓨터에 해를 끼치는 나쁜 프로그램
4. **의심 요소**: 당장은 아니지만 주의가 필요한 부분

## 설명 예시
❌ 나쁜 예: "외부 스크립트 로드 감지"
✅ 좋은 예: "이 사이트는 다른 곳에서 프로그램을 가져와 실행합니다. 이 프로그램이 여러분의 정보를 빼갈 수 있습니다."`,
    },
    {
      role: 'user',
      content,
    },
  ];
}

/**
 * AI 응답 파싱
 * @param {string} content - AI 응답 텍스트
 * @returns {Object}
 */
function parseAIResponse(content) {
  try {
    // JSON 블록 추출 시도
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                      content.match(/\{[\s\S]*\}/);

    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const parsed = JSON.parse(jsonStr);

    // 필수 필드 검증 및 기본값 설정
    return {
      riskScore: parsed.riskScore ?? 50,
      riskLevel: parsed.riskLevel ?? 'warning',
      summary: parsed.summary ?? '분석 결과를 확인할 수 없습니다.',
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      codeAnalysis: parsed.codeAnalysis ?? {
        hiddenFields: 0,
        externalScripts: 0,
        suspiciousPatterns: [],
        explanation: '',
      },
      visualAnalysis: parsed.visualAnalysis ?? null,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      simpleExplanation: parsed.simpleExplanation ?? '',
      confidence: parsed.confidence ?? 50,
      // 리다이렉트 분석 결과 추가
      redirectAnalysis: parsed.redirectAnalysis ?? null,
    };

  } catch (error) {
    console.warn('[Live Analyzer] AI 응답 파싱 실패:', error.message);

    return {
      riskScore: 50,
      riskLevel: 'warning',
      summary: content.substring(0, 200),
      findings: [{
        category: 'suspicious',
        severity: 'medium',
        description: 'AI 분석 결과를 파싱할 수 없습니다.',
      }],
      codeAnalysis: {
        hiddenFields: 0,
        externalScripts: 0,
        suspiciousPatterns: [],
      },
      recommendations: ['수동으로 확인이 필요합니다.'],
      confidence: 30,
      rawResponse: content,
    };
  }
}

// ============================================
// 비동기 백그라운드 분석
// ============================================

/**
 * 백그라운드 분석 실행 (비동기, WebSocket으로 결과 전송)
 * @param {import('puppeteer').Page} page - Puppeteer 페이지 객체
 * @param {Function} sendMessage - 메시지 전송 함수 (WebSocket 등)
 * @param {Object} options - 추가 옵션
 * @returns {Promise<void>}
 */
export async function analyzeInBackground(page, sendMessage, options = {}) {
  const currentUrl = page.url();
  const originalUrl = options.originalUrl || currentUrl;
  const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // 리다이렉트 감지
  const redirectInfo = detectRedirect(originalUrl, currentUrl);

  // 분석 시작 알림
  sendMessage({
    type: 'analysis_started',
    analysisId,
    url: currentUrl,
    originalUrl,
    redirected: redirectInfo.redirected,
    timestamp: new Date().toISOString(),
  });

  try {
    // 1. 데이터 수집
    sendMessage({
      type: 'analysis_progress',
      analysisId,
      stage: 'collecting',
      message: '페이지 데이터 수집 중...',
    });

    const data = await collectAnalysisData(page);

    // 메타 정보도 수집
    const metaInfo = await getMetaInfo(page);

    sendMessage({
      type: 'analysis_progress',
      analysisId,
      stage: 'collected',
      message: '데이터 수집 완료, AI 분석 시작...',
      preview: {
        url: data.url,
        title: data.title,
        formCount: data.forms.length,
        scriptCount: data.scripts.length,
        hasScreenshot: !!data.screenshot,
        ...metaInfo,
      },
    });

    // 2. AI 멀티모달 분석
    sendMessage({
      type: 'analysis_progress',
      analysisId,
      stage: 'analyzing',
      message: 'AI 멀티모달 분석 중...',
    });

    const result = await analyzeWithAIMultimodal({ ...data, metaInfo }, redirectInfo);

    // 3. 분석 완료 알림
    sendMessage({
      type: 'analysis_complete',
      analysisId,
      url: data.url,
      originalUrl,
      redirected: redirectInfo.redirected,
      title: data.title,
      timestamp: new Date().toISOString(),
      ...result,
    });

  } catch (error) {
    console.error('[Live Analyzer] 백그라운드 분석 오류:', error.message);

    sendMessage({
      type: 'analysis_error',
      analysisId,
      url,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 간편 분석 함수 (Promise 반환)
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object>} 분석 결과
 */
export async function analyzePage(page) {
  const data = await collectAnalysisData(page);
  const metaInfo = await getMetaInfo(page);

  return analyzeWithAIMultimodal({ ...data, metaInfo });
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 위험 레벨 결정
 * @param {number} score
 * @returns {string}
 */
export function determineRiskLevel(score) {
  if (score <= 30) return 'safe';
  if (score <= 70) return 'warning';
  return 'danger';
}

/**
 * 분석 결과 요약 생성
 * @param {Object} result
 * @returns {string}
 */
export function generateSummary(result) {
  const { riskScore, riskLevel, findings } = result;

  const levelText = {
    safe: '안전',
    warning: '주의 필요',
    danger: '위험',
  };

  const highSeverityCount = findings.filter(f => f.severity === 'high').length;

  if (highSeverityCount > 0) {
    return `${levelText[riskLevel]} (${riskScore}점) - ${highSeverityCount}개의 심각한 위험 발견`;
  }

  if (findings.length > 0) {
    return `${levelText[riskLevel]} (${riskScore}점) - ${findings.length}개의 주의 사항 발견`;
  }

  return `${levelText[riskLevel]} (${riskScore}점)`;
}

export default {
  collectAnalysisData,
  getFormInfo,
  getScriptInfo,
  getMetaInfo,
  analyzeWithAIMultimodal,
  analyzeInBackground,
  analyzePage,
  determineRiskLevel,
  generateSummary,
};
