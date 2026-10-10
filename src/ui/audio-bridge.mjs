import { createVoicePlayer } from '../audio/voice-player.mjs';
import { createRecorder } from '../audio/push-to-talk.mjs';

export const makeVoicePlayer = (desktop) => createVoicePlayer({ desktop });

export function makeRecorder() {
  // The browser preview (?mock=…) swaps in a fake microphone; builds drop this branch.
  if (import.meta.env.DEV && globalThis.__guardLabDevRecorder)
    return globalThis.__guardLabDevRecorder();
  return createRecorder({ desktop: globalThis.window?.desktop });
}
