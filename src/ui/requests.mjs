// Routes one decision to whichever controller drives an actor (Codex, API, terminal agent).
export async function requestDecision({
  desktop,
  mode,
  id,
  data,
  sessionId,
  actor,
  allTools,
  codexSettings,
  modelConfig,
  ready,
}) {
  if (!desktop) throw new Error('Open the desktop app to connect an AI.');
  if (mode === 'codex') {
    await ready?.catch(() => {});
    return desktop.codex.request({
      id,
      sessionId,
      actor,
      messages: data.messages,
      tools: data.tools,
      allTools,
      settings: codexSettings,
    });
  }
  if (mode === 'live') return desktop.requestRobot({ id, ...data, actor });
  return desktop.requestModel({ id, ...data, modelConfig });
}

export function cancelDecision(desktop, mode, id) {
  if (!desktop || !id) return;
  const pending = mode === 'codex' ? desktop.codex?.cancel(id) : desktop.cancelModel?.(id);
  pending?.catch?.(() => {});
}

export function prepareCodex(desktop, payload) {
  if (!desktop?.codex?.prepare) return Promise.resolve();
  const pending = Promise.resolve(desktop.codex.prepare(payload));
  pending.catch(() => {});
  return pending;
}

export function resetCodex(desktop, sessionId) {
  desktop?.codex?.reset?.(sessionId)?.catch?.(() => {});
}

// Electron prefixes IPC failures with the channel name; players only need the reason.
export const cleanError = (error) =>
  String(error?.message || error || 'Something went wrong.')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^(Error:\s*)+/, '');
