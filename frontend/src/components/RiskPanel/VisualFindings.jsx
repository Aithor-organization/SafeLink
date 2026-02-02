/**
 * VisualFindings - 시각적 분석 결과
 * - findings 배열 렌더링
 * - 심각도별 아이콘 표시
 */
export function VisualFindings({ findings }) {
  if (!findings || findings.length === 0) {
    return (
      <div className="visual-findings">
        <h3 className="findings-title">
          <span className="findings-icon">👁️</span>
          시각적 분석
        </h3>
        <p className="no-findings">시각적 위험 요소가 발견되지 않았습니다.</p>
      </div>
    );
  }

  // 심각도별 아이콘
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

  // 심각도별 레이블
  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 'high':
        return '높음';
      case 'medium':
        return '중간';
      case 'low':
        return '낮음';
      default:
        return '알 수 없음';
    }
  };

  // 카테고리별 그룹화
  const groupedFindings = findings.reduce((acc, finding) => {
    const category = finding.category || '기타';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(finding);
    return acc;
  }, {});

  // 카테고리 아이콘
  const getCategoryIcon = (category) => {
    const icons = {
      '로그인 폼': '🔐',
      '팝업': '📢',
      '리다이렉트': '↪️',
      '입력 필드': '📝',
      'UI 요소': '🎨',
      '기타': '📋'
    };
    return icons[category] || '📋';
  };

  return (
    <div className="visual-findings">
      <h3 className="findings-title">
        <span className="findings-icon">👁️</span>
        시각적 분석
      </h3>

      {Object.entries(groupedFindings).map(([category, items]) => (
        <div key={category} className="finding-category">
          <h4 className="category-title">
            <span className="category-icon">{getCategoryIcon(category)}</span>
            {category}
          </h4>

          <ul className="findings-list">
            {items.map((finding, idx) => (
              <li
                key={idx}
                className={`finding-item severity-${finding.severity || 'medium'}`}
              >
                <div className="finding-header">
                  <span className="severity-icon">
                    {getSeverityIcon(finding.severity)}
                  </span>
                  <span className="severity-label">
                    {getSeverityLabel(finding.severity)}
                  </span>
                </div>
                <p className="finding-description">{finding.description}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
