import React, { useEffect } from 'react';
import { CircleAlert, Download, Mic, Play, Plus, RotateCcw, ScrollText, X } from 'lucide-react';
import { Button, Spinner } from './kit.jsx';

export function Subtitles({ line, callout }) {
  return (
    <div className="subtitles" aria-live="polite">
      {callout && (
        <div key={callout.id} className={`callout callout-${callout.tone || 'info'}`}>
          {callout.text}
        </div>
      )}
      {line && (
        <p
          key={line.id}
          className={`subtitle subtitle-${line.who} ${line.pending ? 'is-pending' : ''}`}
        >
          <span className="subtitle-speaker">
            {line.who === 'robot' ? 'G-01' : line.name || 'You'}
          </span>
          <span className="subtitle-text">{line.text}</span>
        </p>
      )}
    </div>
  );
}

export function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      onDismiss,
      toast.duration || (toast.tone === 'error' ? (toast.action ? 12000 : 8000) : 3500),
    );
    return () => clearTimeout(timer);
  }, [toast]);
  if (!toast) return null;
  const error = toast.tone === 'error';
  return (
    <div
      key={toast.id}
      className={`toast toast-${toast.tone || 'info'}`}
      role={error ? 'alert' : 'status'}
    >
      {error && <CircleAlert size={18} strokeWidth={1.75} aria-hidden="true" />}
      <span className="toast-text">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            onDismiss();
            toast.action.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={onDismiss}>
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

export function TalkPill({ phase, level, keyName }) {
  if (phase === 'idle') return null;
  return (
    <div className={`talk-pill talk-${phase}`} role="status" aria-live="assertive">
      {phase === 'listening' ? (
        <>
          <Mic size={18} strokeWidth={2} aria-hidden="true" />
          <span>Listening…</span>
          <span className="level" aria-hidden="true">
            {[0.2, 0.45, 0.7, 0.45, 0.2].map((weight, i) => (
              <i
                key={i}
                style={{ transform: `scaleY(${0.18 + Math.min(1, level * 2.4) * weight * 1.4})` }}
              />
            ))}
          </span>
          <span className="talk-tip">Release {keyName} to send · Esc cancels</span>
        </>
      ) : (
        <>
          <Spinner size={18} />
          <span>Transcribing…</span>
        </>
      )}
    </div>
  );
}

export function EndScreen({ summary, onPlayAgain, onNewGame, onReplay, onLog, onExport }) {
  return (
    <div className={`end-screen end-${summary.tone}`} role="dialog" aria-label="Game over">
      <div className="end-card">
        <h1>{summary.title}</h1>
        <p>{summary.line}</p>
        <div className="end-actions">
          {onPlayAgain && (
            <Button variant="primary" size="lg" icon={RotateCcw} onClick={onPlayAgain} autoFocus>
              Play again
            </Button>
          )}
          <Button size="lg" icon={Plus} onClick={onNewGame}>
            New game
          </Button>
        </div>
        <div className="end-links">
          {onReplay && (
            <Button variant="ghost" size="sm" icon={Play} onClick={onReplay}>
              Replay
            </Button>
          )}
          {onLog && (
            <Button variant="ghost" size="sm" icon={ScrollText} onClick={onLog}>
              Review log
            </Button>
          )}
          {onExport && (
            <Button variant="ghost" size="sm" icon={Download} onClick={onExport}>
              Export
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children, className = '', actions }) {
  useEffect(() => {
    const close = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <>
      <div className="drawer-scrim" onMouseDown={onClose} />
      <aside className={`drawer ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-head">
          <h2>{title}</h2>
          {actions}
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}
