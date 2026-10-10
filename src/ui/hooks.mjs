import { useCallback, useEffect, useRef, useState } from 'react';
import { APPEARANCES } from '../sim/items.mjs';
import { makeRecorder, makeVoicePlayer } from './audio-bridge.mjs';

const desktop = () => globalThis.window?.desktop;
const CHECKING = {
  state: 'checking',
  message: 'Looking for Codex…',
  fixPrompt: null,
  account: null,
  login: { state: 'idle' },
};

export function useCodex(codexPath) {
  const codex = desktop()?.codex;
  const path = useRef(codexPath);
  path.current = codexPath;
  const [status, setStatus] = useState(codex ? CHECKING : null);
  const [models, setModels] = useState([]);
  const fail = (error) =>
    setStatus((old) => ({
      ...(old || CHECKING),
      state: 'error',
      message: error?.message || 'Codex did not respond.',
    }));
  useEffect(() => {
    if (!codex) return;
    let live = true;
    const off = codex.onStatus?.((next) => live && next && setStatus(next));
    codex
      .status(path.current ? { codexPath: path.current } : {})
      .then((next) => live && setStatus(next))
      .catch((error) => live && fail(error));
    return () => {
      live = false;
      off?.();
    };
  }, []);
  const ready = status?.state === 'ready';
  useEffect(() => {
    if (!codex || !ready) return;
    let live = true;
    codex
      .models()
      .then((list) => live && setModels(Array.isArray(list) ? list : []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ready, status?.account?.email]);
  const refresh = useCallback(async () => {
    if (!codex) return;
    setStatus((old) => ({ ...(old || CHECKING), state: 'checking', message: CHECKING.message }));
    try {
      setStatus(await codex.status({ refresh: true, codexPath: path.current || '' }));
    } catch (error) {
      fail(error);
    }
  }, []);
  const login = useCallback(async () => {
    if (!codex) return;
    setStatus((old) => ({ ...(old || CHECKING), login: { state: 'pending' } }));
    try {
      await codex.login();
    } catch (error) {
      setStatus((old) => ({
        ...(old || CHECKING),
        login: { state: 'failed', error: error?.message || 'Sign-in failed.' },
      }));
    }
  }, []);
  const cancelLogin = useCallback(() => {
    codex?.cancelLogin?.().catch?.(() => {});
    setStatus((old) => (old ? { ...old, login: { state: 'idle' } } : old));
  }, []);
  return { available: Boolean(codex), status, models, refresh, login, cancelLogin };
}

export function useVoice() {
  const voice = desktop()?.voice;
  const [status, setStatus] = useState(null);
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    if (!voice) return;
    let live = true;
    const off = voice.onStatus?.((next) => live && next && setStatus(next));
    voice
      .status()
      .then((next) => live && setStatus(next))
      .catch(() => {});
    return () => {
      live = false;
      off?.();
    };
  }, []);
  const ttsReady = status?.tts?.state === 'ready';
  useEffect(() => {
    if (!voice) return;
    let live = true;
    voice
      .voices()
      .then((list) => live && setVoices(Array.isArray(list) ? list : []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ttsReady]);
  const install = useCallback(async (kind) => {
    if (!voice) return;
    setStatus((old) =>
      old ? { ...old, [kind]: { ...old[kind], state: 'installing', progress: 0 } } : old,
    );
    try {
      const next = await voice.install(kind);
      if (next) setStatus(next);
    } catch (error) {
      setStatus((old) =>
        old
          ? {
              ...old,
              [kind]: {
                ...old[kind],
                state: 'error',
                message: error?.message || 'Download failed.',
              },
            }
          : old,
      );
    }
  }, []);
  const remove = useCallback(async (kind) => {
    if (!voice) return;
    try {
      const next = await voice.remove(kind);
      if (next) setStatus(next);
    } catch {}
  }, []);
  return { available: Boolean(voice), status, voices, install, remove };
}

// Records one utterance and returns its transcript. Shared by push-to-talk and mic tests.
export function useVoiceCapture({ onText, onError } = {}) {
  const [phase, setPhase] = useState('idle');
  const [level, setLevel] = useState(0);
  const recorder = useRef(null),
    starting = useRef(null),
    session = useRef(0),
    meter = useRef(0),
    handlers = useRef({});
  handlers.current = { onText, onError };
  const stopMeter = () => {
    cancelAnimationFrame(meter.current);
    setLevel(0);
  };
  const cancel = useCallback(() => {
    session.current++;
    stopMeter();
    try {
      recorder.current?.cancel();
    } catch {}
    setPhase('idle');
  }, []);
  const begin = useCallback(async () => {
    const token = ++session.current;
    setPhase('listening');
    try {
      recorder.current ||= makeRecorder();
      if (!recorder.current) throw new Error('Voice input is unavailable in this build.');
      starting.current = recorder.current.start();
      await starting.current;
      if (token !== session.current) return;
      const tick = () => {
        setLevel(Math.max(0, Math.min(1, recorder.current?.level?.() || 0)));
        meter.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      if (token !== session.current) return;
      session.current++;
      stopMeter();
      setPhase('idle');
      handlers.current.onError?.(error);
    }
  }, []);
  const end = useCallback(async () => {
    const token = session.current;
    if (!recorder.current || !starting.current) return cancel();
    stopMeter();
    setPhase('transcribing');
    try {
      await starting.current;
      if (token !== session.current) return;
      const clip = await recorder.current.stop();
      if (token !== session.current) return;
      if (!clip?.pcm?.length || (clip.durationMs ?? 1000) < 300) {
        setPhase('idle');
        handlers.current.onError?.(new Error('Hold the key while you talk.'));
        return;
      }
      const result = await desktop().voice.transcribe({
        pcm: clip.pcm,
        sampleRate: clip.sampleRate,
      });
      if (token !== session.current) return;
      setPhase('idle');
      const text = String(result?.text || '').trim();
      if (text) handlers.current.onText?.(text);
      else handlers.current.onError?.(new Error('Didn’t catch that. Try again.'));
    } catch (error) {
      if (token !== session.current) return;
      setPhase('idle');
      handlers.current.onError?.(error);
    } finally {
      if (token === session.current) starting.current = null;
    }
  }, []);
  useEffect(
    () => () => {
      session.current++;
      cancelAnimationFrame(meter.current);
      try {
        recorder.current?.cancel();
      } catch {}
    },
    [],
  );
  return { phase, level, begin, end, cancel };
}

export const isTyping = (element) =>
  Boolean(
    element &&
    (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)),
  );

// Hold a key to talk; release to transcribe and send. Esc cancels.
export function usePushToTalk({ enabled, code = 'Space', ready, onText, onUnavailable, onError }) {
  const capture = useVoiceCapture({ onText, onError });
  const held = useRef(false),
    state = useRef({});
  state.current = { ready, onUnavailable, capture };
  useEffect(() => {
    if (!enabled) return;
    const down = (event) => {
      if (event.code === 'Escape' && held.current) {
        event.preventDefault();
        event.stopPropagation();
        held.current = false;
        state.current.capture.cancel();
        return;
      }
      if (event.code !== code || isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Without voice input, leave Space to focused buttons; elsewhere it opens the say box.
      if (!state.current.ready && event.target?.closest?.('button, a, [role="button"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || held.current) return;
      if (!state.current.ready) {
        state.current.onUnavailable?.();
        return;
      }
      held.current = true;
      state.current.capture.begin();
    };
    const up = (event) => {
      if (event.code !== code) return;
      if (!held.current) {
        if (!isTyping(event.target) && state.current.ready) event.preventDefault();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      held.current = false;
      state.current.capture.end();
    };
    const abandon = () => {
      if (!held.current) return;
      held.current = false;
      state.current.capture.cancel();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', abandon);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', abandon);
      abandon();
    };
  }, [enabled, code]);
  return capture;
}

export function useVoicePlayer() {
  const player = useRef(null);
  if (!player.current) player.current = makeVoicePlayer(desktop());
  return player.current;
}

export const appearanceVoice = (appearance) =>
  APPEARANCES.find((a) => a.id === appearance)?.voice || APPEARANCES[0]?.voice;

// Chooses each event's voice: recordings carry their own; the human follows appearance.
export function voiceForEvent(ev, voiceConfig = {}, fallbackAppearance = 'male') {
  if (ev?.voice && ev.voice.startsWith('kokoro:')) return ev.voice;
  if (ev?.kind === 'robot') return voiceConfig.guardVoice;
  return (
    voiceConfig.humanVoice || appearanceVoice(ev?.state?.human?.appearance || fallbackAppearance)
  );
}

// Plays event speech with pre-synthesis, cancellation and a speaking indicator.
export function useSpeaker({ enabled, voiceConfig, appearance }) {
  const player = useVoicePlayer();
  const [speaking, setSpeaking] = useState(null);
  const cache = useRef(new Map()),
    generation = useRef(0),
    settings = useRef({});
  settings.current = { enabled, voiceConfig, appearance };
  const prepare = useCallback((ev) => {
    const { enabled, voiceConfig, appearance } = settings.current;
    if (!enabled || !ev?.speech) return null;
    const voice = voiceForEvent(ev, voiceConfig, appearance),
      actor = ev.kind === 'robot' ? 'robot' : 'human',
      key = `${actor}|${voice}|${ev.speech}`;
    if (!cache.current.has(key)) {
      const pending = Promise.resolve(player.prepare(ev.speech, { actor, voice }));
      pending.catch(() => {});
      cache.current.set(key, pending);
      if (cache.current.size > 24) cache.current.delete(cache.current.keys().next().value);
    }
    return cache.current.get(key);
  }, []);
  const speak = useCallback(async (ev, prepared, { onStart } = {}) => {
    if (!settings.current.enabled || !ev?.speech) return;
    const token = generation.current;
    const actor = ev.kind === 'robot' ? 'robot' : 'human';
    setSpeaking(actor);
    try {
      const ready = await (prepared || prepare(ev));
      if (token !== generation.current || !settings.current.enabled || !ready) return;
      await player.play(ready, { onStart });
    } finally {
      if (token === generation.current) setSpeaking(null);
    }
  }, []);
  const stop = useCallback(() => {
    generation.current++;
    try {
      player.stop();
    } catch {}
    setSpeaking(null);
  }, []);
  useEffect(() => stop, []);
  return { speaking, prepare, speak, stop, player };
}

export function useDismiss(active, onDismiss) {
  const handler = useRef(onDismiss);
  handler.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const close = (event) => {
      if (event.key === 'Escape') handler.current?.(event);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [active]);
}
