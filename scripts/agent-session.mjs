import readline from 'node:readline';
import { waitForTurn, sendDecision } from '../shared/bridge.mjs';

// JSON-lines transport for harnesses that retain one subprocess per actor.
export async function agentSession(directory, output) {
  const input = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = input[Symbol.asyncIterator]();
  const controller = new AbortController();
  input.on('close', () => controller.abort());
  let afterId = null;
  try {
    while (!controller.signal.aborted) {
      const packet = await waitForTurn(directory, {
        afterId,
        timeoutMs: 25000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) break;
      if (packet.status === 'awaiting_next_turn') continue;
      output(packet);
      if (packet.status === 'ended') break;
      while (true) {
        const next = await lines.next();
        if (next.done) return;
        try {
          const decision = JSON.parse(next.value);
          if (decision.id !== packet.id)
            throw new Error('Reply must include the current packet id.');
          const { id, ...action } = decision;
          output(await sendDecision(directory, action, id));
          afterId = id;
          break;
        } catch (error) {
          output({ error: error.message });
          const current = await waitForTurn(directory, { timeoutMs: 0 });
          if (current.id !== packet.id) {
            afterId = packet.id;
            break;
          }
        }
      }
    }
  } finally {
    input.close();
  }
}
