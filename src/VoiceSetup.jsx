import { useEffect, useState } from 'react';
import './voice-setup.css';

export default function VoiceSetup() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!window.desktop?.getVoiceStatus) return;
    let active = true;
    let previousPhase;
    const refresh = () =>
      window.desktop
        .getVoiceStatus()
        .then((value) => {
          if (active) {
            setStatus(value);
            if (value.phase === 'ready' && previousPhase !== 'ready')
              window.dispatchEvent(new Event('guard-voices-ready'));
            previousPhase = value.phase;
          }
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!status || status.phase === 'ready') return null;
  const failed = status.phase === 'error';
  const percent = status.total
    ? Math.min(100, Math.floor((status.received / status.total) * 100))
    : null;
  return (
    <div className="voice-setup" role="status" aria-live="polite">
      {!failed && <span className="voice-setup-spinner" />}
      <span title={status.message}>
        {failed
          ? 'English voice download failed'
          : status.phase === 'checking'
            ? 'Preparing English voices'
            : 'Installing English voices'}
        <small>
          {failed ? status.message : status.message + (percent === null ? '' : ` · ${percent}%`)}
        </small>
      </span>
      {failed && (
        <button
          onClick={() => {
            setStatus({ phase: 'checking', message: 'Retrying English voice download' });
            window.desktop.installVoices().catch(() => {});
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
