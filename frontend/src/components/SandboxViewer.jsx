import { useEffect, useCallback } from 'react';

/**
 * 샌드박스 Canvas 뷰어
 * - 실시간 브라우저 화면 렌더링
 * - 마우스/키보드 이벤트 캡처 및 전송
 */
export function SandboxViewer({
  canvasRef,
  onMouseMove,
  onClick,
  onScroll,
  onKeyDown,
  disabled = false
}) {
  // 키보드 이벤트 리스너 등록
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

    canvas.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('keydown', handleKeyDown);
    };
  }, [canvasRef, onKeyDown, disabled]);

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

  // 스크롤 핸들러
  const handleWheel = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    onScroll(e.deltaX, e.deltaY);
  }, [onScroll, disabled]);

  return (
    <div className="sandbox-viewer">
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
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
      {disabled && (
        <div className="viewer-overlay">
          <span>URL을 입력하고 접속 버튼을 클릭하세요</span>
        </div>
      )}
    </div>
  );
}
