import { useState } from 'react';

/**
 * URL 입력 컴포넌트
 * - URL 유효성 검사
 * - 접속 버튼
 */
export function UrlInput({ onSubmit, disabled }) {
  const [url, setUrl] = useState('https://');
  const [isValid, setIsValid] = useState(true);

  // URL 유효성 검사
  const validateUrl = (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  // URL 변경 핸들러
  const handleChange = (e) => {
    const value = e.target.value;
    setUrl(value);
    setIsValid(value === '' || validateUrl(value));
  };

  // 폼 제출 핸들러
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!url || !validateUrl(url)) {
      setIsValid(false);
      return;
    }

    onSubmit(url);
  };

  return (
    <form className="url-input-form" onSubmit={handleSubmit}>
      <div className="input-wrapper">
        <span className="input-icon">🔗</span>
        <input
          type="url"
          value={url}
          onChange={handleChange}
          placeholder="https://example.com"
          disabled={disabled}
          className={!isValid ? 'invalid' : ''}
          aria-label="검사할 URL 입력"
          autoFocus
        />
      </div>
      {!isValid && (
        <span className="error-message">유효한 URL을 입력하세요</span>
      )}
      <button
        type="submit"
        disabled={disabled || !url || !isValid}
        className="submit-button"
      >
        {disabled ? '연결 중...' : '🔍 안전 검사 시작'}
      </button>
    </form>
  );
}
