import React from 'react';
import { ZONE_INFO } from './play.mjs';
import { Segmented } from './kit.jsx';

// A top-down plan of the room. North (the exit wall) is at the top, like the camera view.
export function MiniMap({ zone, disabled, onMove, run, onRun, hasItem }) {
  return (
    <div className="minimap">
      <div className="minimap-room" role="group" aria-label="Room map. Choose where to go.">
        <span className="map-door map-door-exit" aria-hidden="true" />
        <span className="map-door map-door-entrance" aria-hidden="true" />
        <span className="map-safe" aria-hidden="true" />
        <span className="map-robot" aria-hidden="true">
          G-01
        </span>
        {ZONE_INFO.map((z) => {
          const here = z.id === zone;
          return (
            <button
              type="button"
              key={z.id}
              className={`map-zone ${here ? 'is-here' : ''}`}
              style={{ left: `${z.x}%`, top: `${z.y}%` }}
              disabled={disabled || here}
              aria-current={here ? 'location' : undefined}
              aria-label={
                here ? `${z.label} (you are here)` : `${run ? 'Run' : 'Walk'} to ${z.label}`
              }
              onClick={() => onMove(z.id)}
            >
              <span className="map-pin">{here ? '' : z.key}</span>
              <span className="map-label">{here ? 'You' : z.label}</span>
            </button>
          );
        })}
      </div>
      <div className="minimap-foot">
        <Segmented
          size="xs"
          label="Pace"
          value={run ? 'run' : 'walk'}
          onChange={(value) => onRun(value === 'run')}
          options={[
            { value: 'walk', label: 'Walk' },
            { value: 'run', label: 'Run', title: 'Faster and louder' },
          ]}
        />
        <span className="minimap-tip">{hasItem ? 'Run for the exit' : 'Press 1–5'}</span>
      </div>
    </div>
  );
}
