import path from 'node:path';
import { ROOT } from './paths.mjs';
import { chooseVoiceRoot, installVoices } from '../shared/voice-install.mjs';

const root = await chooseVoiceRoot({ development: path.join(ROOT, '.voice-runtime') });
let last = '';
await installVoices({
  root,
  onProgress: ({ message }) => {
    if (message !== last) console.log(message);
    last = message;
  },
});
console.log('English voices are ready. Assets are cached outside published source.');
