import { temporaryDirectory, removeTemporary } from '../shared/temporary.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import speech from '../electron/voices.cjs';
import { ROOT } from './paths.mjs';
import { chooseVoiceRoot } from '../shared/voice-install.mjs';
const cache = await temporaryDirectory('guard-voice-test-');
const voices = new speech.LocalVoices(
  await chooseVoiceRoot({ development: path.join(ROOT, '.voice-runtime') }),
  cache,
);
try {
  for (const name of ['ryan', 'amy', 'lessac']) {
    const result = await voices.synthesize({
      text: 'This English voice is ready for the guard experiment.',
      voice: 'piper:' + name,
    });
    if (result.native) throw new Error('Local assets absent. Run npm run voices:install.');
    if (Buffer.from(result.audio).toString('ascii', 0, 4) !== 'RIFF')
      throw new Error('Invalid voice audio.');
    console.log('OK: ' + name);
  }
} finally {
  voices.close();
  await removeTemporary(cache);
}
