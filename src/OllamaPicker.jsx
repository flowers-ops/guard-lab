import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
export const isOllamaEndpoint = (endpoint) => {
  try {
    return new URL(endpoint).port === '11434';
  } catch {
    return false;
  }
};
export function OllamaPicker({ endpoint, model, onSelect, actor = 'guard' }) {
  const [models, setModels] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      if (!window.desktop) throw new Error('Open the standalone app to list your local models.');
      const result = await window.desktop.testModel({ endpoint });
      setModels(result.models);
      if (!result.models.length)
        setError('No models installed. Add a model in Ollama, then refresh.');
    } catch (err) {
      setModels([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [endpoint]);
  return (
    <div className="ollama-picker">
      <div>
        <span>OLLAMA · {actor.toUpperCase()} AI</span>
        <button title={`Refresh ${actor} Ollama models`} disabled={loading} onClick={refresh}>
          <RefreshCw size={13} />
          {loading ? 'Finding models…' : 'Refresh'}
        </button>
      </div>
      <select
        aria-label={`${actor} Ollama model`}
        value={models.includes(model) ? model : ''}
        disabled={loading || !models.length}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Choose an installed model</option>
        {models.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <p>{error || `${models.length} installed models · runs locally · no API key needed`}</p>
    </div>
  );
}
