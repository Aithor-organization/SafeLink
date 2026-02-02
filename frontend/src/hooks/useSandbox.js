import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket 기반 샌드박스 연결 훅
 * - 실시간 프레임 수신 및 Canvas 렌더링
 * - 마우스/키보드 이벤트 전송
 * - 분석 결과 수신
 */
export function useSandbox() {
  const [status, setStatus] = useState('disconnected');
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [blockedDownload, setBlockedDownload] = useState(null);
  const wsRef = useRef(null);
  const canvasRef = useRef(null);

  // WebSocket 연결 및 URL 탐색 시작
  const connect = useCallback((url) => {
    // 기존 연결 종료
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    setAnalysis(null);
    setError(null);

    const ws = new WebSocket('ws://localhost:4000/sandbox');
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // 샌드박스 세션 시작 요청
      ws.send(JSON.stringify({ type: 'start', url }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'frame':
          // Base64 인코딩된 프레임을 Canvas에 렌더링
          renderFrame(msg.data);
          break;

        case 'status':
          // 상태 업데이트 (browsing, analyzing 등)
          setStatus(msg.status);
          break;

        case 'analysis_started':
          setStatus('analyzing');
          break;

        case 'analysis_progress':
          // 분석 진행 상태 업데이트
          console.log('[분석 진행]', msg.stage, msg.message);
          break;

        case 'analysis_complete':
          // 분석 완료 - 결과 저장 (msg에서 직접 추출)
          setAnalysis({
            score: msg.riskScore,
            riskLevel: msg.riskLevel,
            summary: msg.summary,
            threats: msg.findings,
            codeAnalysis: msg.codeAnalysis,
            visualAnalysis: msg.visualAnalysis,
            recommendations: msg.recommendations,
            confidence: msg.confidence
          });
          setStatus('completed');
          break;

        case 'analysis_error':
          console.error('[분석 오류]', msg.error);
          break;

        case 'error':
          setError(msg.message);
          setStatus('error');
          break;

        case 'download_blocked':
          // 다운로드 차단 알림
          setBlockedDownload({
            filename: msg.filename,
            fileSize: msg.fileSizeFormatted,
            contentType: msg.contentType,
            riskScore: msg.riskScore,
            riskLevel: msg.riskLevel,
            threats: msg.threats || [],
            message: msg.message,
            timestamp: msg.timestamp,
          });
          break;

        default:
          console.log('Unknown message type:', msg.type);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('WebSocket 연결 오류');
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };
  }, []);

  // Base64 프레임을 Canvas에 렌더링
  const renderFrame = useCallback((base64Data) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    img.src = `data:image/jpeg;base64,${base64Data}`;
  }, []);

  // 마우스 이동 이벤트 전송
  const sendMouseMove = useCallback((x, y) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mousemove',
        x: Math.round(x),
        y: Math.round(y)
      }));
    }
  }, []);

  // 클릭 이벤트 전송
  const sendClick = useCallback((x, y, button = 'left') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'click',
        x: Math.round(x),
        y: Math.round(y),
        button
      }));
    }
  }, []);

  // 키보드 이벤트 전송
  const sendKeyDown = useCallback((key) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'keydown',
        key
      }));
    }
  }, []);

  // 스크롤 이벤트 전송
  const sendScroll = useCallback((deltaX, deltaY) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'scroll',
        deltaX: Math.round(deltaX),
        deltaY: Math.round(deltaY)
      }));
    }
  }, []);

  // 뒤로가기
  const sendGoBack = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'goBack' }));
    }
  }, []);

  // 앞으로가기
  const sendGoForward = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'goForward' }));
    }
  }, []);

  // 새로고침
  const sendReload = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reload' }));
    }
  }, []);

  // 연결 종료
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    setAnalysis(null);
    setError(null);
    setBlockedDownload(null);
  }, []);

  // 다운로드 알림 닫기
  const dismissDownloadAlert = useCallback(() => {
    setBlockedDownload(null);
  }, []);

  // 컴포넌트 언마운트 시 연결 종료
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    status,
    analysis,
    error,
    blockedDownload,
    canvasRef,
    connect,
    disconnect,
    dismissDownloadAlert,
    sendMouseMove,
    sendClick,
    sendKeyDown,
    sendScroll,
    sendGoBack,
    sendGoForward,
    sendReload
  };
}
