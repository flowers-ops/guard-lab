import React from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { IconButton } from './kit.jsx';

export function ReplayBar({
  index,
  total,
  playing,
  speed,
  chapters,
  chapter,
  onRewind,
  onToggle,
  onNext,
  onSeek,
  onSpeed,
  onChapter,
}) {
  return (
    <div className="replay-bar" role="toolbar" aria-label="Replay controls">
      <IconButton icon={SkipBack} label="Back to start" onClick={onRewind} />
      <button
        type="button"
        className="replay-play"
        aria-label={playing ? 'Pause replay' : 'Play replay'}
        onClick={onToggle}
      >
        {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
      </button>
      <IconButton
        icon={SkipForward}
        label="Next event"
        disabled={playing || index >= total}
        onClick={onNext}
      />
      <input
        className="replay-scrub"
        aria-label="Replay position"
        type="range"
        min="0"
        max={total}
        value={Math.max(0, index)}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className="replay-count">
        {Math.max(0, index)} / {total}
      </span>
      {chapters && (
        <select
          className="select select-sm"
          aria-label="Chapter"
          value={chapter ?? -1}
          onChange={(e) => onChapter(Number(e.target.value))}
        >
          <option value="-1">Introduction</option>
          {chapters.map((c) => (
            <option key={c.index} value={c.index}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <select
        className="select select-sm"
        aria-label="Replay speed"
        value={speed}
        onChange={(e) => onSpeed(Number(e.target.value))}
      >
        <option value="0.5">0.5×</option>
        <option value="1">1×</option>
        <option value="2">2×</option>
      </select>
    </div>
  );
}
