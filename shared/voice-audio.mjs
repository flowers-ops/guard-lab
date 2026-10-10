// Pure audio/text helpers (no Node or DOM imports) shared by the renderer, the voice worker,
// the CLI installer and tests.

export const STT_SAMPLE_RATE = 16000;

/** Encode mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples, sampleRate) {
  if (!(sampleRate > 0)) throw new Error('Invalid WAV sample rate.');
  const count = samples.length,
    bytes = new Uint8Array(44 + count * 2),
    view = new DataView(bytes.buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const value = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return bytes;
}

/** Decode a PCM16 / PCM32 / float32 WAV file into mono float samples. */
export function decodeWav(input) {
  const bytes =
    input instanceof Uint8Array
      ? input
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
    throw new Error('Not a WAV file.');
  let format, channels, sampleRate, bits, data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = tag(offset),
      size = view.getUint32(offset + 4, true),
      body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true);
    } else if (id === 'data') data = [body, Math.min(size, bytes.length - body)];
    offset = body + size + (size % 2);
  }
  if (!data || !channels || !sampleRate) throw new Error('Incomplete WAV file.');
  const width = bits / 8,
    frames = Math.floor(data[1] / (width * channels)),
    samples = new Float32Array(frames);
  const read =
    format === 3 && bits === 32
      ? (at) => view.getFloat32(at, true)
      : format === 1 && bits === 16
        ? (at) => view.getInt16(at, true) / 0x8000
        : format === 1 && bits === 32
          ? (at) => view.getInt32(at, true) / 0x80000000
          : null;
  if (!read) throw new Error('Unsupported WAV encoding.');
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++)
      sum += read(data[0] + (frame * channels + channel) * width);
    samples[frame] = sum / channels;
  }
  return { samples, sampleRate, channels };
}

/**
 * Band-limited resampling with a Hann-windowed sinc kernel. Downsampling filters above the
 * new Nyquist frequency, so 44.1/48 kHz microphone audio becomes clean 16 kHz input.
 */
export function resample(input, from, to) {
  if (!(from > 0) || !(to > 0)) throw new Error('Invalid sample rate.');
  if (from === to) return Float32Array.from(input);
  const ratio = to / from,
    length = Math.max(0, Math.round(input.length * ratio)),
    output = new Float32Array(length);
  const cutoff = 0.5 * Math.min(1, ratio) * 0.94, // cycles per input sample
    half = Math.ceil(8 / (2 * cutoff)), // eight zero crossings each side
    last = input.length - 1;
  for (let n = 0; n < length; n++) {
    const center = n / ratio,
      start = Math.max(0, Math.ceil(center - half)),
      end = Math.min(last, Math.floor(center + half));
    let sum = 0,
      weight = 0;
    for (let k = start; k <= end; k++) {
      const x = k - center,
        phase = 2 * Math.PI * cutoff * x,
        h = (x === 0 ? 1 : Math.sin(phase) / phase) * (0.5 + 0.5 * Math.cos((Math.PI * x) / half));
      sum += input[k] * h;
      weight += h;
    }
    output[n] = weight ? sum / weight : 0;
  }
  return output;
}

/** Loudest 30 ms frame RMS. */
export function peakFrameRms(samples, sampleRate = STT_SAMPLE_RATE) {
  const frame = Math.max(1, Math.round(sampleRate * 0.03));
  let peak = 0;
  for (let start = 0; start < samples.length; start += frame) {
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    peak = Math.max(peak, Math.sqrt(sum / (end - start)));
  }
  return peak;
}

/** True when a recording holds no speech-level sound (avoids Whisper silence hallucinations). */
export const isSilent = (samples, sampleRate = STT_SAMPLE_RATE) =>
  samples.length < sampleRate * 0.15 || peakFrameRms(samples, sampleRate) < 0.003;

/** Remove Whisper non-speech annotations such as [BLANK_AUDIO] or (music). */
export function cleanTranscript(text) {
  return String(text || '')
    .replace(/\[[^\]]*\]|\([a-z ]{1,24}\)|\*[^*]{1,40}\*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Amounts and quantities keep their normal reading ("$500" is "five hundred dollars").
const CURRENCY_BEFORE = /[$£€¥₹]\s?$/;
const QUANTITY_AFTER =
  /^\s?(?:%|percent\b|per cent\b|dollars?\b|bucks\b|euros?\b|pounds?\b|quid\b|yen\b|cents?\b|credits?\b|grand\b|k\b|thousand\b|hundred\b|million\b|billion\b|times\b|people\b|guards?\b|(?:kilo|centi|milli)?met(?:er|re)s?\b|feet\b|foot\b|miles?\b|km\b|kg\b|lbs?\b|degrees?\b|(?:milli)?seconds?\b|minutes?\b|hours?\b|days?\b|weeks?\b|months?\b|years?\b)/i;
const YEAR_BEFORE = /\b(?:in|since|until|till|by|from|before|after|around|circa|year)\s$/i;

/**
 * Text prepared for Kokoro: markdown symbols removed, whitespace collapsed and code-like digit
 * runs (safe codes, badge numbers) read digit by digit. Money, quantities and years introduced
 * by "in", "since"... keep their normal reading.
 */
export function speakableText(text, limit = 2000) {
  return String(text ?? '')
    .replace(/[`*_#~<>{}|\\]/g, ' ')
    .replace(/(?<![\d.,])\d{3,}(?![.,]?\d)/g, (digits, offset, whole) => {
      const before = whole.slice(Math.max(0, offset - 12), offset),
        after = whole.slice(offset + digits.length, offset + digits.length + 16);
      if (CURRENCY_BEFORE.test(before) || QUANTITY_AFTER.test(after)) return digits;
      if (/^(?:1[89]|20)\d\d$/.test(digits) && YEAR_BEFORE.test(before)) return digits;
      return digits.split('').join(' ');
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/** Sentences (split further at clauses, then words, when longer than `max`). */
export function sentencePieces(text, max = 260) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const pieces = [];
  for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
    if (sentence.length <= max) {
      pieces.push(sentence);
      continue;
    }
    for (const clause of sentence.split(/(?<=[,;:—])\s+/)) {
      if (clause.length <= max) {
        pieces.push(clause);
        continue;
      }
      let rest = clause;
      while (rest.length > max) {
        const cut = rest.lastIndexOf(' ', max);
        const at = cut > max / 3 ? cut : max;
        pieces.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) pieces.push(rest);
    }
  }
  return pieces;
}

/**
 * Split text into chunks short enough for one Kokoro pass (its context is 510 phoneme tokens),
 * preferring sentence, then clause, then word boundaries.
 */
export function sentenceChunks(text, max = 260) {
  const chunks = [];
  for (const piece of sentencePieces(text, max)) {
    const previous = chunks.at(-1);
    if (previous && previous.length + 1 + piece.length <= max)
      chunks[chunks.length - 1] += ' ' + piece;
    else chunks.push(piece);
  }
  return chunks;
}

/** Join float chunks with a short silence between them. */
export function joinAudio(parts, sampleRate, gapSeconds = 0.09) {
  const gap = Math.round(sampleRate * gapSeconds),
    total = parts.reduce((sum, part) => sum + part.length, 0) + gap * Math.max(0, parts.length - 1),
    output = new Float32Array(total);
  let offset = 0;
  parts.forEach((part, index) => {
    if (index) offset += gap;
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

export function sizeLabel(bytes) {
  if (!(bytes > 0)) return '0 MB';
  const mb = bytes / 1e6;
  return mb >= 1000 ? (mb / 1000).toFixed(1) + ' GB' : Math.max(1, Math.round(mb)) + ' MB';
}
