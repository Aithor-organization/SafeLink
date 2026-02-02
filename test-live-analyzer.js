/**
 * Live Analyzer 테스트 클라이언트
 * WebSocket 연결 및 분석 요청 테스트
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:4001';
const TEST_URL = process.argv[2] || 'https://example.com';

console.log('='.repeat(60));
console.log('Safe-Link Sandbox Live Analyzer 테스트');
console.log('='.repeat(60));
console.log(`WebSocket 서버: ${WS_URL}`);
console.log(`테스트 URL: ${TEST_URL}`);
console.log('='.repeat(60));

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('\n[연결] WebSocket 서버에 연결되었습니다.\n');

  // 분석 요청 전송
  console.log('[요청] 분석 시작...');
  ws.send(JSON.stringify({
    type: 'analyze',
    url: TEST_URL,
    options: {
      timeout: 30000,
    },
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  switch (message.type) {
    case 'connected':
      console.log(`[서버] 연결 확인 - Client ID: ${message.clientId}`);
      break;

    case 'analysis_started':
      console.log(`\n[분석 시작] ${message.url}`);
      console.log(`  Analysis ID: ${message.analysisId}`);
      break;

    case 'analysis_progress':
      console.log(`[진행] ${message.stage}: ${message.message}`);
      if (message.preview) {
        console.log('  미리보기:', JSON.stringify(message.preview, null, 2).split('\n').map(l => '    ' + l).join('\n'));
      }
      break;

    case 'analysis_complete':
      console.log('\n' + '='.repeat(60));
      console.log('[분석 완료]');
      console.log('='.repeat(60));
      console.log(`\n  URL: ${message.url}`);
      console.log(`  제목: ${message.title || '(없음)'}`);
      console.log(`\n  위험도 점수: ${message.riskScore}/100`);
      console.log(`  위험도 레벨: ${message.riskLevel}`);
      console.log(`  분석 신뢰도: ${message.confidence}%`);
      console.log(`\n  요약: ${message.summary}`);

      if (message.findings && message.findings.length > 0) {
        console.log('\n  발견 사항:');
        message.findings.forEach((f, i) => {
          console.log(`    ${i + 1}. [${f.severity.toUpperCase()}] ${f.category}: ${f.description}`);
        });
      }

      if (message.codeAnalysis) {
        console.log('\n  코드 분석:');
        console.log(`    - 숨겨진 필드: ${message.codeAnalysis.hiddenFields}개`);
        console.log(`    - 외부 스크립트: ${message.codeAnalysis.externalScripts}개`);
        if (message.codeAnalysis.suspiciousPatterns?.length > 0) {
          console.log(`    - 의심 패턴: ${message.codeAnalysis.suspiciousPatterns.join(', ')}`);
        }
      }

      if (message.visualAnalysis) {
        console.log('\n  시각적 분석:');
        console.log(`    - 브랜드 위조: ${message.visualAnalysis.brandImitation ? 'Yes' : 'No'}`);
        console.log(`    - 긴급성 유도: ${message.visualAnalysis.urgencyTactics ? 'Yes' : 'No'}`);
        console.log(`    - 가짜 보안 배지: ${message.visualAnalysis.fakeSecurityBadges ? 'Yes' : 'No'}`);
        if (message.visualAnalysis.description) {
          console.log(`    - 설명: ${message.visualAnalysis.description}`);
        }
      }

      if (message.recommendations && message.recommendations.length > 0) {
        console.log('\n  권장 사항:');
        message.recommendations.forEach((r, i) => {
          console.log(`    ${i + 1}. ${r}`);
        });
      }

      if (message.usage) {
        console.log('\n  AI 사용량:');
        console.log(`    - 입력 토큰: ${message.usage.prompt_tokens}`);
        console.log(`    - 출력 토큰: ${message.usage.completion_tokens}`);
      }

      console.log('\n' + '='.repeat(60));
      ws.close();
      break;

    case 'analysis_error':
      console.error(`\n[오류] ${message.error}`);
      ws.close();
      break;

    case 'error':
      console.error(`\n[서버 오류] ${message.error}`);
      break;

    default:
      console.log(`[메시지] ${message.type}:`, message);
  }
});

ws.on('error', (error) => {
  console.error('\n[연결 오류]', error.message);
  console.log('\n힌트: WebSocket 서버가 실행 중인지 확인하세요.');
  console.log('  npm run live-analyzer');
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n[연결 종료] WebSocket 연결이 종료되었습니다.');
  process.exit(0);
});

// 타임아웃 (2분)
setTimeout(() => {
  console.error('\n[타임아웃] 분석 시간이 초과되었습니다.');
  ws.close();
  process.exit(1);
}, 120000);
