// Dialogue playback: local Kokoro WAVs through WebAudio, with system speech as the fallback.
// The guard gets a light "speaker" treatment (band-limit, faint ring modulation and a short
// metallic comb); human voices play clean.
import { nativeSpeech } from './speech.mjs';
import { decodeWav, sentencePieces } from '../../shared/voice-audio.mjs';
import {
  VOICES,
  DEFAULT_VOICES,
  defaultVoice,
  resolveVoice,
  voicesFor as catalogVoicesFor,
} from '../../shared/voice-catalog.mjs';

export { VOICES, DEFAULT_VOICES, defaultVoice };

/**
 * Segments for playback: the first sentence alone so speech starts quickly, then groups that
 * grow with what is already queued. Kokoro runs faster than real time, so each segment is
 * normally ready before the previous one finishes playing.
 */
export function playbackSegments(text) {
  const pieces = sentencePieces(text, 140);
  if (pieces.length <= 1) return pieces;
  const segments = [pieces[0]];
  let current = '';
  for (const piece of pieces.slice(1)) {
    const budget = Math.min(240, Math.max(60, segments.at(-1).length * 2.5));
    if (current && current.length + 1 + piece.length > budget) {
      segments.push(current);
      current = piece;
    } else current = current ? current + ' ' + piece : piece;
  }
  if (current) segments.push(current);
  return segments;
}

function robotChain(context, destination) {
  const nodes = [];
  const node = (value) => (nodes.push(value), value);
  const filter = (type, frequency, q, gain) => {
    const f = node(context.createBiquadFilter());
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    if (gain !== undefined) f.gain.value = gain;
    return f;
  };
  const level = (value) => {
    const g = node(context.createGain());
    g.gain.value = value;
    return g;
  };
  const input = level(1),
    highpass = filter('highpass', 170, 0.7),
    presence = filter('peaking', 2300, 0.9, 3),
    lowpass = filter('lowpass', 7000, 0.6),
    mix = level(1);
  input.connect(highpass).connect(presence).connect(lowpass);
  lowpass.connect(level(0.82)).connect(mix);
  // Ring modulation at a low carrier, mixed quietly: a faint electronic buzz, still clear.
  const ring = level(0),
    carrier = node(context.createOscillator());
  carrier.frequency.value = 70;
  carrier.connect(ring.gain);
  lowpass.connect(ring).connect(level(0.2)).connect(mix);
  // Short feedback comb (~6.5 ms) for a metallic housing resonance.
  const delay = node(context.createDelay(0.05)),
    feedback = level(0.26);
  delay.delayTime.value = 0.0065;
  lowpass.connect(delay).connect(feedback).connect(delay);
  delay.connect(level(0.16)).connect(mix);
  mix.connect(destination);
  carrier.start();
  return {
    input,
    dispose() {
      try {
        carrier.stop();
      } catch {}
      for (const n of nodes) n.disconnect();
    },
  };
}

function decodeResult(result) {
  if (result?.cancelled) return { cancelled: true };
  if (!result || result.native) return { native: true };
  const { samples, sampleRate } = decodeWav(result.audio);
  return {
    samples,
    sampleRate,
    durationMs: result.durationMs ?? Math.round((samples.length / sampleRate) * 1000),
    voice: result.voice,
  };
}

// What a prepared line needs to re-request a segment; survives `{ ...prepared }` copies.
const LINE = Symbol('guard-lab.voice-line');
let players = 0;

export function createVoicePlayer({
  desktop = globalThis.window?.desktop,
  AudioContextClass,
} = {}) {
  const api = desktop?.voice;
  // Synthesis requests carry this player's channel and an utterance number, so segments of a
  // stopped line can be dropped from the voice queue before they delay the next line.
  const channel = `player-${(++players).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const outstanding = new Map(),
    drops = new Set();
  let context = null,
    output = null,
    current = null,
    utterances = 0,
    plays = 0,
    stops = 0;

  function cancelUtterances(ids) {
    const list = [...new Set(ids)].filter(Number.isSafeInteger);
    if (!list.length || !api?.synthesize) return;
    for (const id of list) outstanding.delete(id);
    if (typeof api.cancel === 'function') {
      try {
        Promise.resolve(api.cancel({ channel, utterances: list })).catch(() => {});
        return;
      } catch {}
    }
    // Otherwise the drop list rides along with the next synthesis request.
    for (const id of list) drops.add(id);
    while (drops.size > 256) drops.delete(drops.values().next().value);
  }

  function request(text, { voice, actor, speed }, utterance) {
    const drop = [...drops];
    drops.clear();
    outstanding.set(utterance, (outstanding.get(utterance) || 0) + 1);
    let call;
    try {
      call = Promise.resolve(
        api.synthesize({
          text,
          voice,
          actor,
          ...(speed ? { speed } : {}),
          channel,
          utterance,
          ...(drop.length ? { drop } : {}),
        }),
      );
    } catch (error) {
      call = Promise.reject(error);
    }
    const task = call.then(decodeResult).finally(() => {
      const left = (outstanding.get(utterance) || 0) - 1;
      if (left > 0) outstanding.set(utterance, left);
      else outstanding.delete(utterance);
    });
    task.catch(() => {});
    return task;
  }

  function audio() {
    if (!context) {
      const Context = AudioContextClass || globalThis.AudioContext || globalThis.webkitAudioContext;
      context = new Context();
      output = context.createDynamicsCompressor();
      output.threshold.value = -14;
      output.knee.value = 8;
      output.ratio.value = 3;
      output.attack.value = 0.004;
      output.release.value = 0.2;
      output.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  /** Start synthesizing now; resolves once the first segment is ready (or speech is native). */
  function prepare(text, { actor = 'robot', voice, speed } = {}) {
    const clean = String(text ?? '').trim();
    actor = actor === 'human' ? 'human' : 'robot';
    const chosen = String(voice || '').startsWith('native:') ? voice : resolveVoice(voice, actor);
    const base = { text: clean, actor, voice: chosen, native: false, segments: [] };
    if (!clean) return Promise.resolve(base);
    if (!api?.synthesize) return Promise.resolve({ ...base, native: true });
    try {
      audio(); // Create the output graph now; the first AudioContext takes a moment.
    } catch {}
    const utterance = ++utterances,
      texts = playbackSegments(clean),
      options = { voice: chosen, actor, speed };
    const segments = texts.map((segment) => request(segment, options, utterance));
    return segments[0].then(
      (first) =>
        first.native
          ? { ...base, native: true }
          : {
              ...base,
              voice: first.voice || chosen,
              segments,
              [LINE]: { utterance, texts, options },
            },
      // Local synthesis failed: speak with the system voice rather than stay silent.
      (error) => {
        cancelUtterances([utterance]);
        return { ...base, native: true, error: error?.message || String(error) };
      },
    );
  }

  function playSegment(part, actor, playback, started) {
    return new Promise((resolve) => {
      const ctx = audio();
      const buffer = ctx.createBuffer(1, part.samples.length, part.sampleRate);
      buffer.getChannelData(0).set(part.samples);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const chain = actor === 'robot' ? robotChain(ctx, output) : null;
      source.connect(chain ? chain.input : output);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          source.stop();
        } catch {}
        source.disconnect();
        // Let the comb tail ring out briefly before tearing the chain down.
        if (chain) setTimeout(() => chain.dispose(), 120);
        resolve();
      };
      source.onended = finish;
      playback.finish = finish;
      source.start();
      started();
    });
  }

  function speakNatively(text, voice, actor, playback, started) {
    return nativeSpeech(
      text,
      voice,
      actor,
      (handle) => {
        playback.finish = handle.finish;
        if (playback.stopped) handle.finish();
      },
      started,
    );
  }

  /** Stop the current playback and drop its queued segments (except `keep`'s). */
  function halt(keep) {
    const playback = current;
    current = null;
    if (!playback) return;
    playback.stopped = true;
    playback.finish();
    cancelUtterances(playback.utterances.filter((id) => id !== keep));
  }

  /**
   * Play a prepared line (or the promise from prepare()). Resolves when it finishes or is
   * stopped. A stop() or a newer play() issued while the line is still being prepared wins.
   */
  async function play(prepared, { onStart } = {}) {
    const ticket = ++plays,
      stopped = stops;
    if (typeof prepared?.then === 'function') prepared = await prepared;
    if (ticket !== plays || stopped !== stops) return;
    const line = prepared?.[LINE];
    halt(line?.utterance);
    if (!prepared?.text) return;
    const playback = {
      stopped: false,
      finish: () => {},
      utterances: line ? [line.utterance] : [],
    };
    current = playback;
    let announced = false;
    const started = () => {
      if (announced) return;
      announced = true;
      onStart?.();
    };
    try {
      if (prepared.native) {
        await speakNatively(prepared.text, prepared.voice, prepared.actor, playback, started);
        return;
      }
      const parts = prepared.segments.slice();
      let retry = null;
      for (let index = 0; index < parts.length; index++) {
        let part;
        try {
          part = await parts[index];
        } catch (error) {
          part = { failed: error };
        }
        if (playback.stopped) return;
        if (part?.cancelled && line) {
          // Dropped from the queue by an earlier stop(): synthesize the rest again now.
          if (!retry) {
            retry = ++utterances;
            playback.utterances.push(retry);
            for (let next = index; next < parts.length; next++)
              parts[next] = Promise.resolve(parts[next]).then((result) =>
                result?.cancelled ? request(line.texts[next], line.options, retry) : result,
              );
          }
          try {
            part = await parts[index];
          } catch (error) {
            part = { failed: error };
          }
          if (playback.stopped) return;
        }
        if (part?.samples?.length) {
          await playSegment(part, prepared.actor, playback, started);
        } else if ((part?.failed || part?.native) && line) {
          // The local voice failed for this segment: the words matter, so use the system voice.
          try {
            await speakNatively(
              line.texts[index],
              prepared.voice,
              prepared.actor,
              playback,
              started,
            );
          } catch {}
        }
        if (playback.stopped) return;
      }
    } finally {
      if (current === playback) current = null;
    }
  }

  /** Stop speaking and drop every queued segment this player requested. */
  function stop() {
    stops++;
    halt();
    cancelUtterances([...outstanding.keys()]);
  }

  return {
    prepare,
    play,
    stop,
    /** Voices suited to an appearance id / APPEARANCES entry / 'robot', default first. */
    voicesFor: (appearance) => catalogVoicesFor(appearance),
    voices: VOICES,
    get speaking() {
      return Boolean(current);
    },
    close() {
      stop();
      context?.close?.().catch?.(() => {});
      context = null;
      output = null;
    },
  };
}
