import React from 'react';
import { OllamaPicker, isOllamaEndpoint } from './OllamaPicker.jsx';
export function AlternateSetup({ config, onChange, apiKey, onKey }) {
  const human = config.humanAI || {
      mode: 'demo',
      endpoint: 'http://localhost:11434/v1',
      model: '',
    },
    update = (patch) => onChange({ humanAI: { ...human, ...patch } });
  return (
    <details className="alternate-setup">
      <summary>
        Other ways to play <span>Guard control · AI vs AI</span>
      </summary>
      <div className="segmented">
        <button
          className={!config.sessionType || config.sessionType === 'human' ? 'active' : ''}
          onClick={() => onChange({ sessionType: 'human' })}
        >
          Play as human
        </button>
        <button
          className={config.sessionType === 'guard' ? 'active' : ''}
          onClick={() => onChange({ sessionType: 'guard' })}
        >
          Play as guard
        </button>
        <button
          className={config.sessionType === 'duel' ? 'active' : ''}
          onClick={() => onChange({ sessionType: 'duel' })}
        >
          AI vs AI
        </button>
      </div>
      {['guard', 'duel'].includes(config.sessionType) && (
        <>
          <p className="field-help">
            {config.sessionType === 'guard'
              ? 'You control G-01. The human AI chooses its own item and takes one action before each of your turns.'
              : 'Two independent agents take turns. The guard uses Model lab above; configure the human’s separate connection here.'}{' '}
            The selected human role sets its private objective. Its loadout is chosen by its model.
          </p>
          <div className="segmented">
            <button
              className={human.mode === 'demo' ? 'active' : ''}
              onClick={() => update({ mode: 'demo' })}
            >
              Scripted human demo
            </button>
            <button
              className={human.mode === 'api' ? 'active' : ''}
              onClick={() => update({ mode: 'api' })}
            >
              Human local / API model
            </button>
            <button
              className={human.mode === 'live' ? 'active' : ''}
              onClick={() => update({ mode: 'live' })}
            >
              Human live agent
            </button>
          </div>
          {human.mode === 'live' && (
            <p className="field-help">
              Start a separate terminal agent with node scripts/robot-link.mjs observe
              --actor=human. It chooses its own item, then takes one action per round.
            </p>
          )}
          <div className="provider-presets">
            <button
              onClick={() => {
                update({
                  mode: 'api',
                  endpoint: 'http://localhost:11434/v1',
                  model: isOllamaEndpoint(human.endpoint) ? human.model : '',
                });
                onKey('');
              }}
            >
              Connect human to Ollama
            </button>
            <button
              onClick={() =>
                update({ mode: 'api', endpoint: 'http://localhost:1234/v1', model: '' })
              }
            >
              LM Studio
            </button>
          </div>
          {human.mode === 'api' && (
            <>
              {isOllamaEndpoint(human.endpoint) && (
                <OllamaPicker
                  endpoint={human.endpoint}
                  model={human.model}
                  onSelect={(model) => update({ model })}
                  actor="human"
                />
              )}
              <label className="field">
                Human API base URL
                <input
                  value={human.endpoint}
                  onChange={(e) => update({ endpoint: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                />
              </label>
              <div className="two-fields">
                <label className="field">
                  Human model name
                  <input
                    value={human.model}
                    onChange={(e) => update({ model: e.target.value })}
                    placeholder="Your human AI model"
                  />
                </label>
                <label className="field">
                  Human API key <small>optional for local models</small>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => onKey(e.target.value)}
                    placeholder="Kept in memory this session"
                  />
                </label>
              </div>
            </>
          )}
        </>
      )}
    </details>
  );
}
