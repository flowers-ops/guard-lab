export * from '../shared/bridge.mjs';
import { waitForTurn } from '../shared/bridge.mjs';

// A managed terminal task stays alive between human moves. Unlike a bounded
// snapshot, idle does not look like completion to the controlling agent.
export async function listenForTurn(directory, options = {}) {
  const timeoutMs = options.timeoutMs ?? 25000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000)
    throw new Error('Listen wait must be greater than 0 and at most 60000 milliseconds.');
  while (true) {
    const packet = await waitForTurn(directory, { ...options, timeoutMs });
    if (packet.status !== 'awaiting_next_turn') return packet;
  }
}
