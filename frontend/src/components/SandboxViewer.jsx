import { useEffect, useCallback } from 'react';

/**
 * 샌드박스 Canvas 뷰어
 * - 실시간 브라우저 화면 렌더링
 * - 마우스/키보드 이벤트 캡처 및 전송
 * - 로딩/에러 상태 표시
 */
export function SandboxViewer({
  canvasRef,
  onMouseMove,
  onClick,
  onScroll,
  onKeyDown,
  disabled = false,
  status = 'disconnected'
}) {
  // 키보드 및 휠 이벤트 리스너 등록
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;

    const handleKeyDown = (e) => {
      // 특수 키 처리
      let key = e.key;

      // 기본 브라우저 동작 방지 (스크롤, 뒤로가기 등)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', ' '].includes(key)) {
        e.preventDefault();
      }

      onKeyDown(key);
    };

    // passive: false로 설정하여 preventDefault 허용
    const handleWheel = (e) => {
      e.preventDefault();
      onScroll(e.deltaX, e.deltaY);
    };

    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [canvasRef, onKeyDown, onScroll, disabled]);

  // 마우스 이동 핸들러 (throttle 적용)
  const handleMouseMove = useCallback((e) => {
    if (disabled) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    onMouseMove(x, y);
  }, [onMouseMove, disabled]);

  // 클릭 핸들러
  const handleClick = useCallback((e) => {
    if (disabled) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const button = e.button === 2 ? 'right' : 'left';
    onClick(x, y, button);
  }, [onClick, disabled]);

  // 우클릭 핸들러
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (disabled) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    onClick(x, y, 'right');
  }, [onClick, disabled]);

  return (
    <div className="sandbox-viewer">
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        style={{
          border: disabled ? '2px solid #ccc' : '2px solid #4CAF50',
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          maxWidth: '100%',
          height: 'auto',
          backgroundColor: '#1a1a1a'
        }}
      />
      {/* 상태별 오버레이 */}
      {status === 'disconnected' && (
        <div className="viewer-overlay">
          <span>URL을 입력하고 안전검사 시작 버튼을 클릭하세요</span>
        </div>
      )}
      {status === 'connecting' && (
        <div className="viewer-overlay viewer-overlay-loading">
          <div className="viewer-spinner"></div>
          <span>서버에 연결 중...</span>
        </div>
      )}
      {status === 'connected' && (
        <div className="viewer-overlay viewer-overlay-loading">
          <div className="viewer-spinner"></div>
          <span>브라우저 준비 중...</span>
        </div>
      )}
      {status === 'loading' && (
        <div className="viewer-overlay viewer-overlay-loading">
          <div className="viewer-spinner"></div>
          <span>페이지 불러오는 중...</span>
        </div>
      )}
      {status === 'timeout' && (
        <div className="viewer-overlay viewer-overlay-error">
          <span className="viewer-error-icon">⏱️</span>
          <span>연결 시간 초과</span>
          <span className="viewer-error-sub">10초 내에 응답이 없습니다. 다시 시도해주세요.</span>
        </div>
      )}
      {status === 'error' && (
        <div className="viewer-overlay viewer-overlay-error">
          <span className="viewer-error-icon">❌</span>
          <span>연결 실패</span>
          <span className="viewer-error-sub">서버에 연결할 수 없습니다.</span>
        </div>
      )}
    </div>
  );
}
