/**
 * RiskSummary - 위험도 점수 및 요약 표시
 * - 큰 원형 점수 표시
 * - 위험 레벨 배지
 * - 한 줄 요약
 * - 신뢰도 표시
 */
export function RiskSummary({ riskScore, riskLevel, summary, confidence }) {
  // 위험도 레벨별 색상
  const getLevelColor = (level) => {
    switch (level) {
      case 'safe':
        return '#4CAF50';
      case 'warning':
        return '#FFC107';
      case 'danger':
        return '#F44336';
      default:
        return '#888';
    }
  };

  // 위험도 레벨 한글
  const getLevelText = (level) => {
    switch (level) {
      case 'safe':
        return '안전';
      case 'warning':
        return '주의';
      case 'danger':
        return '위험';
      default:
        return '알 수 없음';
    }
  };

  // 원형 게이지 계산
  const circumference = 2 * Math.PI * 45;
  const scoreOffset = circumference - (riskScore / 100) * circumference;
  const levelColor = getLevelColor(riskLevel);

  return (
    <div className="risk-summary">
      {/* 원형 점수 표시 */}
      <div className="score-circle-container">
        <svg className="score-circle" viewBox="0 0 100 100">
          {/* 배경 원 */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="8"
          />
          {/* 점수 원 */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={levelColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={scoreOffset}
            transform="rotate(-90 50 50)"
            className="score-progress"
          />
        </svg>
        <div className="score-value">
          <span className="score-number">{riskScore}</span>
          <span className="score-label">위험도</span>
        </div>
      </div>

      {/* 위험 레벨 배지 */}
      <div
        className={`risk-level-badge risk-level-${riskLevel}`}
        style={{ backgroundColor: levelColor }}
      >
        {riskLevel === 'safe' && '🛡️ '}
        {riskLevel === 'warning' && '⚠️ '}
        {riskLevel === 'danger' && '🚨 '}
        {getLevelText(riskLevel)}
      </div>

      {/* 요약 */}
      {summary && (
        <p className="risk-summary-text">{summary}</p>
      )}

      {/* 신뢰도 */}
      {confidence !== undefined && (
        <div className="confidence-bar">
          <span className="confidence-label">분석 신뢰도</span>
          <div className="confidence-track">
            <div
              className="confidence-fill"
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className="confidence-value">{confidence}%</span>
        </div>
      )}
    </div>
  );
}
