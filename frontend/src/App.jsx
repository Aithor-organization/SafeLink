import { useSandbox } from './hooks/useSandbox';
import { UrlInput } from './components/UrlInput';
import { SandboxViewer } from './components/SandboxViewer';
import { RiskPanel } from './components/RiskPanel';
import './App.css';

/**
 * Safe-Link Sandbox 메인 앱
 * - URL 입력 및 샌드박스 세션 관리
 * - 실시간 브라우저 뷰어
 * - 위험도 분석 패널 표시
 */
function App() {
  const {
    status,
    analysis,
    error,
    canvasRef,
    connect,
    disconnect,
    sendMouseMove,
    sendClick,
    sendKeyDown,
    sendScroll
  } = useSandbox();

  // 상태별 메시지
  const getStatusMessage = () => {
    switch (status) {
      case 'disconnected':
        return { text: '대기 중', color: '#888' };
      case 'connecting':
        return { text: '연결 중...', color: '#FFC107' };
      case 'connected':
        return { text: '연결됨', color: '#4CAF50' };
      case 'browsing':
        return { text: '브라우징 중...', color: '#2196F3' };
      case 'analyzing':
        return { text: 'AI 분석 중...', color: '#9C27B0' };
      case 'completed':
        return { text: '분석 완료', color: '#4CAF50' };
      case 'error':
        return { text: '오류 발생', color: '#F44336' };
      default:
        return { text: status, color: '#888' };
    }
  };

  // RiskPanel용 분석 데이터 변환
  const getRiskPanelData = () => {
    if (!analysis && status !== 'analyzing') return null;

    // 분석 중일 때 로딩 상태
    if (status === 'analyzing') {
      return { status: 'loading' };
    }

    // 에러 상태
    if (status === 'error') {
      return {
        status: 'error',
        summary: error || '분석 중 오류가 발생했습니다.'
      };
    }

    // 분석 완료
    if (analysis) {
      return {
        status: 'complete',
        riskScore: analysis.score || 0,
        riskLevel: analysis.riskLevel || 'safe',
        summary: analysis.summary || '',
        findings: analysis.threats?.map(t => ({
          category: t.category || t.type || '기타',
          severity: t.severity || 'medium',
          description: t.description
        })) || [],
        codeAnalysis: analysis.codeAnalysis || {
          hiddenFields: analysis.hiddenFields || 0,
          externalScripts: analysis.externalScripts || 0,
          suspiciousPatterns: analysis.suspiciousPatterns || []
        },
        recommendations: analysis.recommendations ||
          (analysis.recommendation ? [analysis.recommendation] : []),
        confidence: analysis.confidence || 85
      };
    }

    return null;
  };

  const statusInfo = getStatusMessage();
  const isDisabled = status === 'connecting' || status === 'browsing' || status === 'analyzing';
  const riskPanelData = getRiskPanelData();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Safe-Link Sandbox</h1>
        <p className="subtitle">의심스러운 링크를 안전하게 검사하세요</p>
      </header>

      <main className="app-main">
        {/* URL 입력 섹션 */}
        <section className="input-section">
          <UrlInput onSubmit={connect} disabled={isDisabled} />

          <div className="status-bar">
            <span
              className="status-indicator"
              style={{ backgroundColor: statusInfo.color }}
            />
            <span className="status-text">{statusInfo.text}</span>

            {(status !== 'disconnected' && status !== 'connecting') && (
              <button
                className="disconnect-button"
                onClick={disconnect}
              >
                세션 종료
              </button>
            )}
          </div>
        </section>

        {/* 에러 메시지 (RiskPanel 없을 때만) */}
        {error && !riskPanelData && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => disconnect()}>닫기</button>
          </div>
        )}

        {/* 위험도 분석 패널 (상단) */}
        <RiskPanel analysis={riskPanelData} />

        {/* Canvas 뷰어 섹션 (하단) */}
        <section className="viewer-section">
          <SandboxViewer
            canvasRef={canvasRef}
            onMouseMove={sendMouseMove}
            onClick={sendClick}
            onScroll={sendScroll}
            onKeyDown={sendKeyDown}
            disabled={status === 'disconnected' || status === 'error'}
          />
        </section>
      </main>

      <footer className="app-footer">
        <p>Safe-Link Sandbox - 링크 안전 검사 도구</p>
      </footer>
    </div>
  );
}

export default App;
