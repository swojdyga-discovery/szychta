interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export function ErrorMessage({ message, onRetry, onBack }: ErrorMessageProps) {
  const isCorsError =
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('networkerror') ||
    message.toLowerCase().includes('cors');

  return (
    <div className="error-container">
      <div className="error-card">
        <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h2>Wystąpił błąd</h2>
        <p className="error-text">{message}</p>
        {isCorsError && (
          <div className="cors-hint">
            <strong>Wskazówka:</strong> Ten błąd może być spowodowany przez CORS.
            Serwer Jiry nie pozwala na zapytania z przeglądarki.
            Spróbuj zainstalować rozszerzenie do przeglądarki "CORS Unblock"
            lub skontaktuj się z administratorem Jiry.
          </div>
        )}
        <div className="error-actions">
          {onRetry && (
            <button className="btn-primary" onClick={onRetry}>
              Spróbuj ponownie
            </button>
          )}
          {onBack && (
            <button className="btn-secondary" onClick={onBack}>
              Wróć do logowania
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
