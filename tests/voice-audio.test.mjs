import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeWav,
  decodeWav,
  resample,
  isSilent,
  cleanTranscript,
  speakableText,
  sentenceChunks,
  joinAudio,
  sizeLabel,
} from '../shared/voice-audio.mjs';
import {
  DEFAULT_VOICES,
  VOICES,
  voiceInfo,
  kokoroStyle,
  resolveVoice,
  defaultVoice,
  voicesFor,
} from '../shared/voice-catalog.mjs';
import { APPEARANCES } from '../src/sim/items.mjs';

const tone = (frequency, rate, seconds, amplitude = 0.5) =>
  Float32Array.from(
    { length: Math.round(rate * seconds) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / rate),
  );
const rms = (samples, from = 0, to = samples.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
};
const crossings = (samples) => {
  let count = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 !== samples[i] < 0) count++;
  return count;
};

test('WAV encoding is valid 16-bit mono PCM and decodes back losslessly enough', () => {
  const samples = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2, 0.25]);
  const wav = encodeWav(samples, 24000);
  const view = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.subarray(8, 12)), 'WAVE');
  assert.equal(view.getUint32(4, true), wav.length - 8);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), samples.length * 2);
  const decoded = decodeWav(wav);
  assert.equal(decoded.sampleRate, 24000);
  assert.equal(decoded.samples.length, samples.length);
  const clipped = samples.map((v) => Math.max(-1, Math.min(1, v)));
  decoded.samples.forEach((v, i) => assert.ok(Math.abs(v - clipped[i]) < 1 / 16000));
  assert.throws(() => decodeWav(new Uint8Array(12)), /Not a WAV/);
});

test('float32 stereo WAV decodes to a mono mix', () => {
  const frames = 4,
    bytes = new Uint8Array(44 + frames * 8),
    view = new DataView(bytes.buffer);
  const ascii = (at, text) => [...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 48000 * 8, true);
  view.setUint16(32, 8, true);
  view.setUint16(34, 32, true);
  ascii(36, 'data');
  view.setUint32(40, frames * 8, true);
  for (let i = 0; i < frames; i++) {
    view.setFloat32(44 + i * 8, 0.5, true);
    view.setFloat32(48 + i * 8, -0.1, true);
  }
  const { samples, sampleRate, channels } = decodeWav(bytes);
  assert.equal(sampleRate, 48000);
  assert.equal(channels, 2);
  samples.forEach((v) => assert.ok(Math.abs(v - 0.2) < 1e-6));
});

test('resampling to 16 kHz keeps speech-band tones and removes aliasing content', () => {
  const speech = resample(tone(440, 48000, 1), 48000, 16000);
  assert.equal(speech.length, 16000);
  assert.ok(Math.abs(rms(speech, 200, 15800) - 0.5 / Math.SQRT2) < 0.01);
  assert.ok(Math.abs(crossings(speech) - 880) <= 2, 'frequency preserved');
  const upper = resample(tone(6000, 48000, 0.5), 48000, 16000);
  assert.ok(rms(upper, 200, upper.length - 200) > 0.3, '6 kHz passes');
  const alias = resample(tone(12000, 48000, 0.5), 48000, 16000);
  assert.ok(rms(alias, 200, alias.length - 200) < 0.02, '12 kHz is filtered, not folded to 4 kHz');
  const dc = resample(new Float32Array(44100).fill(0.25), 44100, 16000);
  assert.equal(dc.length, 16000);
  assert.ok(dc.every((v) => Math.abs(v - 0.25) < 1e-4));
  const up = resample(tone(1000, 24000, 0.1), 24000, 48000);
  assert.equal(up.length, 4800);
  const same = Float32Array.from([1, 2, 3]);
  const copy = resample(same, 16000, 16000);
  assert.deepEqual([...copy], [1, 2, 3]);
  assert.notEqual(copy, same);
  assert.throws(() => resample(same, 0, 16000), /Invalid sample rate/);
});

test('silence detection avoids sending empty push-to-talk clips to Whisper', () => {
  assert.equal(isSilent(new Float32Array(16000)), true);
  assert.equal(isSilent(tone(300, 16000, 1, 0.0005)), true);
  assert.equal(isSilent(tone(300, 16000, 0.05, 0.5)), true, 'too short');
  assert.equal(isSilent(tone(300, 16000, 1, 0.1)), false);
});

test('transcripts drop Whisper non-speech annotations', () => {
  assert.equal(cleanTranscript(' [BLANK_AUDIO]'), '');
  assert.equal(cleanTranscript(' Hello (music) there *coughs* [Silence]  '), 'Hello there');
  assert.equal(cleanTranscript('Open the vault.'), 'Open the vault.');
  assert.equal(cleanTranscript(undefined), '');
});

test('speakable text reads codes digit by digit and keeps other numbers', () => {
  assert.equal(speakableText('The code is 9327.'), 'The code is 9 3 2 7.');
  assert.equal(speakableText('Badge 4815, door 12'), 'Badge 4 8 1 5, door 12');
  assert.equal(speakableText('Pay 1,000 or 3.14159'), 'Pay 1,000 or 3.14159');
  assert.equal(speakableText('**Stop** right   _there_'), 'Stop right there');
  assert.equal(speakableText('x'.repeat(5000)).length, 2000);
});

test('money, quantities and introduced years keep their normal reading', () => {
  assert.equal(
    speakableText('I will pay you $500 to look away.'),
    'I will pay you $500 to look away.',
  );
  assert.equal(speakableText('£2500 now, €1200 later'), '£2500 now, €1200 later');
  assert.equal(speakableText('Take 500 dollars, or 750 bucks.'), 'Take 500 dollars, or 750 bucks.');
  assert.equal(speakableText('Wait 120 seconds. 300% sure.'), 'Wait 120 seconds. 300% sure.');
  assert.equal(speakableText('Built in 1998, open since 2024.'), 'Built in 1998, open since 2024.');
  assert.equal(
    speakableText('$500 for the code 0427, it is 2026.'),
    '$500 for the code 0 4 2 7, it is 2 0 2 6.',
  );
  assert.equal(speakableText('Code 2024 opens it.'), 'Code 2 0 2 4 opens it.');
});

test('long text splits at sentence, clause and word boundaries without losing words', () => {
  const text =
    'Stop. ' +
    'This vault is closed to all visitors, contractors and staff without written approval. '.repeat(
      8,
    ) +
    'Leave now';
  const chunks = sentenceChunks(text, 120);
  assert.ok(chunks.length > 4);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
  assert.equal(chunks.join(' '), text.replace(/\s+/g, ' ').trim());
  const word = 'a'.repeat(300);
  const hard = sentenceChunks(word, 100);
  assert.ok(hard.every((chunk) => chunk.length <= 100));
  assert.equal(hard.join(''), word);
  assert.deepEqual(sentenceChunks('   '), []);
  const joined = joinAudio([new Float32Array(10).fill(1), new Float32Array(5).fill(1)], 100, 0.1);
  assert.equal(joined.length, 25);
  assert.equal(joined[12], 0);
  assert.equal(sizeLabel(92364770), '92 MB');
  assert.equal(sizeLabel(1.5e9), '1.5 GB');
});

test('voice catalog defaults: British guard, American human voices, legacy ids resolve', () => {
  assert.deepEqual(DEFAULT_VOICES, {
    robot: 'kokoro:bm_george',
    male: 'kokoro:am_michael',
    female: 'kokoro:af_heart',
  });
  for (const id of Object.values(DEFAULT_VOICES)) assert.ok(voiceInfo(id));
  for (const appearance of APPEARANCES) assert.ok(voiceInfo(appearance.voice), appearance.voice);
  assert.ok(VOICES.every((v) => /^kokoro:[ab][fm]_[a-z]+$/.test(v.id)));
  assert.ok(VOICES.every((v) => ['American', 'British'].includes(v.accent)));
  assert.equal(kokoroStyle('kokoro:bm_george'), 'bm_george');
  assert.equal(kokoroStyle('kokoro:../../x'), null);
  assert.equal(resolveVoice('piper:lessac', 'robot'), 'kokoro:bm_george');
  assert.equal(resolveVoice('piper:ryan', 'human'), 'kokoro:am_michael');
  assert.equal(resolveVoice('', 'human', 'female'), 'kokoro:af_heart');
  assert.equal(resolveVoice('kokoro:bf_emma', 'robot'), 'kokoro:bf_emma');
  assert.equal(defaultVoice('human', APPEARANCES[1]), 'kokoro:af_heart');
  assert.equal(voicesFor('female')[0].id, 'kokoro:af_heart');
  assert.equal(voicesFor('female')[1].gender, 'female');
  assert.equal(voicesFor('robot')[0].id, 'kokoro:bm_george');
  assert.equal(voicesFor(APPEARANCES[0])[0].id, 'kokoro:am_michael');
  assert.equal(voicesFor('male').length, VOICES.length);
});
