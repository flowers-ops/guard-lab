import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEnglishVoice, nativeSpeech } from '../src/audio/speech.mjs';

test('speech selection never falls back to a German/default voice', () => {
  const german = { name: 'Anna', lang: 'de-DE', default: true };
  const male = { name: 'David', lang: 'en-US' };
  const female = { name: 'Zira', lang: 'en-US' };
  assert.equal(selectEnglishVoice([german], 'native:Anna', 'robot'), null);
  assert.equal(selectEnglishVoice([german, male, female], 'piper:ryan', 'human'), male);
  assert.equal(selectEnglishVoice([german, male, female], 'piper:lessac', 'robot'), female);
  assert.equal(selectEnglishVoice([german, male], 'native:Anna', 'human'), male);
  assert.equal(
    selectEnglishVoice([{ name: 'English', lang: 'en' }], null, 'human').name,
    'English',
  );
});

test('missing English voices produce an actionable error without speaking', async () => {
  let spoken = false;
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => [{ name: 'Anna', lang: 'de-DE' }],
      speak: () => {
        spoken = true;
      },
    },
  };
  try {
    await assert.rejects(
      nativeSpeech('Hello.', 'piper:lessac', 'robot'),
      /No English system voice/,
    );
    assert.equal(spoken, false);
  } finally {
    delete globalThis.window;
  }
});
