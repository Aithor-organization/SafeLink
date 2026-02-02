/**
 * Recommendations - 권장사항 섹션
 * - 체크리스트 스타일
 */
export function Recommendations({ recommendations }) {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <div className="recommendations">
      <h3 className="recommendations-title">
        <span className="recommendations-icon">💡</span>
        권장사항
      </h3>

      <ul className="recommendations-list">
        {recommendations.map((rec, idx) => (
          <li key={idx} className="recommendation-item">
            <span className="check-icon">☐</span>
            <span className="recommendation-text">{rec}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
