import React from 'react';
import { RULES } from './sim/rules.mjs';
import { safeDamage, doorDamage } from './sim/status.mjs';
export function StatusHud({ state, guard = false, spectator = false, visible = true }) {
  const h = state.human,
    r = state.robot,
    health = (value, max) => Math.round((Math.max(0, value) / max) * 100);
  return (
    <div className="encounter-status" aria-label="Encounter health and damage">
      <div className="health-readouts">
        {[
          [
            'HUMAN',
            h.hearts ?? (h.health / 100) * RULES.humanHearts,
            !guard || spectator || visible,
            RULES.humanHearts,
          ],
          [
            'G-01',
            r.hearts ?? (r.health / 100) * RULES.robotHearts,
            guard || spectator || visible,
            RULES.robotHearts,
          ],
        ].map(([name, value, known, max]) => (
          <div className="health-readout" key={name}>
            <span>{name}</span>
            <strong aria-label={known ? `${value} of ${max} hearts` : 'Health unknown'}>
              {known ? `${value}/${max}` : 'UNKNOWN'}
            </strong>
            <div className="health-line">
              <i style={{ width: known ? `${health(value, max)}%` : '0%' }} />
            </div>
          </div>
        ))}
      </div>
      {(visible || spectator) && (
        <div className="structure-readouts">
          <span>
            SAFE DAMAGE <strong>{safeDamage(state)}%</strong>
          </span>
          {(state.room.exitDoor.locked || state.room.exitDoor.broken) && (
            <span>
              EXIT DAMAGE <strong>{doorDamage(state)}%</strong>
            </span>
          )}
        </div>
      )}
      {(!guard || spectator) && (
        <div className="effect-readouts">
          {state.room.smokeTurns > 0 && (
            <strong>
              SMOKE · NO VISION · {state.room.smokeTurns}{' '}
              {state.room.smokeTurns === 1 ? 'ROUND' : 'ROUNDS'} LEFT
            </strong>
          )}
          {h.blurTurns > 0 && (
            <strong>
              PEPPER SPRAY · BLURRED · {h.blurTurns} {h.blurTurns === 1 ? 'ROUND' : 'ROUNDS'} LEFT
            </strong>
          )}
          {h.stun > 0 && (
            <strong>
              STUNNED · SPEECH ONLY · {h.stun} {h.stun === 1 ? 'ROUND' : 'ROUNDS'} LEFT
            </strong>
          )}
        </div>
      )}
    </div>
  );
}
