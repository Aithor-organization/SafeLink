import { RiskSummary } from './RiskSummary';
import { CodeFindings } from './CodeFindings';
import { VisualFindings } from './VisualFindings';
import { Recommendations } from './Recommendations';
import './RiskPanel.css';

/**
 * RiskPanel - 위험도 분석 패널 메인 컴포넌트
 * - 분석 상태에 따른 표시: loading, complete, error
 * - 위험도 레벨에 따른 스타일링
 * - 하위 컴포넌트 조합
 */
export function RiskPanel({ analysis }) {
  // 분석 데이터가 없으면 null
  if (!analysis) return null;

  const {
    status = 'loading',
    riskScore = 0,
    riskLevel = 'safe',
    summary = '',
    findings = [],
    codeAnalysis = null,
    recommendations = [],
    simpleExplanation = '',
    confidence = 0
  } = analysis;

  // 로딩 상태
  if (status === 'loading') {
    return (
      <div className="risk-panel risk-panel-loading">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">AI가 페이지를 분석 중입니다...</p>
          <div className="loading-steps">
            <span className="step active">소스코드 검사</span>
            <span className="step">시각적 분석</span>
            <span className="step">위험도 평가</span>
          </div>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (status === 'error') {
    return (
      <div className="risk-panel risk-panel-error">
        <div className="error-content">
          <span className="error-icon">❌</span>
          <h3>분석 실패</h3>
          <p>{summary || '페이지를 분석하는 중 오류가 발생했습니다.'}</p>
        </div>
      </div>
    );
  }

  // 완료 상태
  return (
    <div className={`risk-panel risk-panel-${riskLevel}`}>
      <div className="risk-panel-header">
        <h2 className="panel-title">
          <span className="panel-icon">🛡️</span>
          위험도 분석 결과
        </h2>
      </div>

      <div className="risk-panel-content">
        {/* 요약 섹션 */}
        <RiskSummary
          riskScore={riskScore}
          riskLevel={riskLevel}
          summary={summary}
          confidence={confidence}
        />

        {/* 일반인을 위한 쉬운 설명 */}
        {simpleExplanation && (
          <div className={`simple-explanation simple-explanation-${riskLevel}`}>
            <div className="simple-explanation-header">
              <span className="simple-explanation-icon">💡</span>
              <span className="simple-explanation-title">쉬운 설명</span>
            </div>
            <p className="simple-explanation-text">{simpleExplanation}</p>
          </div>
        )}

        {/* 구분선 */}
        <div className="panel-divider"></div>

        {/* 소스코드 분석 */}
        <CodeFindings codeAnalysis={codeAnalysis} />

        {/* 시각적 분석 */}
        <VisualFindings findings={findings} />

        {/* 권장사항 */}
        <Recommendations recommendations={recommendations} />
      </div>
    </div>
  );
}
