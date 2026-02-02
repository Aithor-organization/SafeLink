/**
 * CodeFindings - 소스코드 분석 결과
 * - 숨겨진 필드 개수
 * - 외부 스크립트 개수
 * - 의심 패턴 목록
 */
export function CodeFindings({ codeAnalysis }) {
  if (!codeAnalysis) return null;

  const {
    hiddenFields = 0,
    externalScripts = 0,
    suspiciousPatterns = []
  } = codeAnalysis;

  // 패턴 심각도별 아이콘
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high':
        return '🔴';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  };

  // 아무 결과도 없으면 표시 안함
  const hasFindings = hiddenFields > 0 ||
    externalScripts > 0 ||
    suspiciousPatterns.length > 0;

  if (!hasFindings) {
    return (
      <div className="code-findings">
        <h3 className="findings-title">
          <span className="findings-icon">🔍</span>
          소스코드 분석
        </h3>
        <p className="no-findings">의심스러운 코드가 발견되지 않았습니다.</p>
      </div>
    );
  }

  return (
    <div className="code-findings">
      <h3 className="findings-title">
        <span className="findings-icon">🔍</span>
        소스코드 분석
      </h3>

      {/* 숨겨진 필드 */}
      {hiddenFields > 0 && (
        <div className="finding-item finding-warning">
          <span className="finding-icon">👁️‍🗨️</span>
          <span className="finding-text">
            숨겨진 입력 필드 <strong>{hiddenFields}개</strong> 발견
          </span>
        </div>
      )}

      {/* 외부 스크립트 */}
      {externalScripts > 0 && (
        <div className="finding-item finding-warning">
          <span className="finding-icon">📜</span>
          <span className="finding-text">
            외부 스크립트 <strong>{externalScripts}개</strong> 로드
          </span>
        </div>
      )}

      {/* 의심 패턴 */}
      {suspiciousPatterns.length > 0 && (
        <div className="suspicious-patterns">
          <h4 className="patterns-subtitle">의심 패턴</h4>
          <ul className="patterns-list">
            {suspiciousPatterns.map((pattern, idx) => (
              <li key={idx} className={`pattern-item pattern-${pattern.severity || 'medium'}`}>
                <span className="pattern-severity">
                  {getSeverityIcon(pattern.severity)}
                </span>
                <span className="pattern-name">{pattern.name || pattern}</span>
                {pattern.description && (
                  <span className="pattern-desc">{pattern.description}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
