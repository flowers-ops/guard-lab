import { loadArchive, saveArchive } from './ui/archive.mjs';
import { RULES, humanHasVision } from './sim/rules.mjs';
import { submitSpeechOnEnter } from './ui/keyboard.mjs';
import { migrateToolConfig, TOOL_VERSION } from './ui/config.mjs';
import React, { useEffect, useRef, useState } from 'react';
import {
  Shield,
  FlaskConical,
  Archive,
  Settings2,
  ArrowUpRight,
  ArrowUp,
  Plus,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  BadgeCheck,
  UserRound,
  ScanFace,
  LockKeyhole,
  Cpu,
  Footprints,
  DoorOpen,
  Hand,
  KeyRound,
  CircleHelp,
  Download,
  Upload,
  X,
  Check,
  Radio,
  Terminal,
  Eye,
  Zap,
  MessageSquare,
  Square,
  RotateCcw,
  LoaderCircle,
  Crosshair,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { TOOLS, DEFAULT_PROMPT } from './sim/tools.mjs';
import {
  ROLES,
  initialState,
  applyHuman,
  applyTool,
  clone,
  observe,
  distance,
  ROBOT_POS,
} from './sim/engine.mjs';
import { createMessages, runGuard } from './sim/agent.mjs';
import { Room } from './scene/Chamber.jsx';
import { unlockAudio, setSoundEnabled } from './audio/sfx.mjs';
import { createShowcase } from './sim/showcase.mjs';
import { LoadoutPicker, ItemActions, ItemIcon, itemLabel } from './Loadout.jsx';
import { OllamaPicker, isOllamaEndpoint } from './OllamaPicker.jsx';
import AlternateEncounter from './AlternateEncounter.jsx';
import { AlternateSetup } from './AlternateSetup.jsx';
import { StatusHud } from './StatusHud.jsx';
import { APPEARANCES } from './sim/items.mjs';
import { nativeSpeech } from './audio/speech.mjs';

const DEFAULT_CONFIG = {
  sessionType: 'human',
  humanAI: { mode: 'demo', endpoint: 'http://localhost:11434/v1', model: '' },
  mode: 'demo',
  endpoint: 'http://localhost:11434/v1',
  model: '',
  temperature: 0,
  prompt: DEFAULT_PROMPT,
  enabled: TOOLS.map((t) => t.name),
  robotVoice: 'piper:lessac',
  humanVoice: 'piper:ryan',
  appearance: 'male',
  item: 'sack',
  toolVersion: TOOL_VERSION,
  combination: '',
};
function readStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem('cinema-v2-' + key)) || fallback;
  } catch {
    return fallback;
  }
}
function storedConfig() {
  return migrateToolConfig(readStored('guard-config', {}), DEFAULT_CONFIG);
}
function makeRun(role, config) {
  const combination = /^[0-9]{4}$/.test(config.combination)
    ? config.combination
    : String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
  const state = initialState(
    role,
    config.enabled,
    combination,
    crypto.getRandomValues(new Uint32Array(1))[0],
    config,
  );
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: 'Untitled experiment',
    role,
    mode: config.mode,
    phase: 'human',
    pendingHumanEvent: null,
    config: clone(config),
    initial: clone(state),
    state,
    events: [],
    messages: createMessages(config.prompt, combination),
  };
}
const roleIcon = (id) =>
  id === 'employee-pass' ? BadgeCheck : id === 'thief-uniform' ? UserRound : ScanFace;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [config, setConfig] = useState(storedConfig);
  const [run, setRun] = useState(() => makeRun('employee-pass', storedConfig()));
  const [drawer, setDrawer] = useState(false),
    [tray, setTray] = useState(null),
    [modal, setModal] = useState('setup'),
    [role, setRole] = useState('employee-pass');
  const [archive, setArchive] = useState(() => [createShowcase(DEFAULT_CONFIG)]);
  const archiveReady = useRef(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let records = await loadArchive();
        const old = readStored('guard-archive', []);
        if (Array.isArray(old) && old.length) {
          const merged = new Map(
            [...old, ...records]
              .filter((r) => r?.id && Array.isArray(r.events) && r.state)
              .map((r) => [r.id, r]),
          );
          records = [...merged.values()]
            .filter((r) => !r.id.startsWith('guard-all-tools-showcase-'))
            .slice(0, 39);
          await saveArchive(records);
          localStorage.removeItem('cinema-v2-guard-archive');
        }
        if (active) {
          archiveReady.current = true;
          setArchive([createShowcase(DEFAULT_CONFIG), ...records].slice(0, 40));
        }
      } catch {
        if (active) {
          archiveReady.current = true;
          setToast('Local archive unavailable. Export encounters you want to keep.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const [busy, setBusy] = useState(false),
    [thinking, setThinking] = useState(false),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [toast, setToast] = useState('');
  const [event, setEvent] = useState(null),
    [displayState, setDisplayState] = useState(run.state),
    [audio, setAudio] = useState(true),
    [voices, setVoices] = useState([]),
    [speechStatus, setSpeechStatus] = useState('');
  const [alternate, setAlternate] = useState(false),
    [humanApiKey, setHumanApiKey] = useState('');
  const [apiKey, setApiKey] = useState(''),
    [testResult, setTestResult] = useState(null),
    [testing, setTesting] = useState(false),
    [connected, setConnected] = useState(false);
  const [replayIndex, setReplayIndex] = useState(-1),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [code, setCode] = useState('');
  const turnLock = useRef(false);
  const generation = useRef(0),
    speechPlayback = useRef(null),
    preparedSpeech = useRef(new Map());
  useEffect(() => {
    const prime = () => unlockAudio();
    document.addEventListener('pointerdown', prime);
    return () => document.removeEventListener('pointerdown', prime);
  }, []);
  const runRef = useRef(run),
    configRef = useRef(config),
    cancelRef = useRef(null),
    requestId = useRef(null),
    transcriptRef = useRef(null),
    roomRef = useRef(null),
    animationRef = useRef(null),
    playTimer = useRef(null),
    importRef = useRef(null),
    audioRef = useRef(audio);
  runRef.current = run;
  configRef.current = config;
  audioRef.current = audio;
  const isReplay = replayIndex >= -0.5;
  const activeRole = ROLES.find((r) => r.id === run.role) || ROLES[0];
  const RoleIcon = roleIcon(run.role);
  const state = displayState;
  useEffect(() => {
    localStorage.setItem('cinema-v2-guard-config', JSON.stringify(config));
  }, [config]);
  useEffect(() => {
    if (!archiveReady.current) return;
    const timer = setTimeout(
      () =>
        saveArchive(archive).catch(() =>
          setToast('Archive could not be saved. Export encounters you want to keep.'),
        ),
      400,
    );
    return () => clearTimeout(timer);
  }, [archive]);
  useEffect(() => {
    const load = () =>
      window.desktop
        ?.getVoices()
        .then((data) => {
          setVoices(data.voices || []);
          if (data.voices?.length) {
            setConfig((c) => ({
              ...c,
              humanVoice: data.voices.some((v) => v.id === c.humanVoice)
                ? c.humanVoice
                : 'piper:ryan',
              robotVoice: data.voices.some((v) => v.id === c.robotVoice)
                ? c.robotVoice
                : 'piper:lessac',
            }));
          }
        })
        .catch(() =>
          setSpeechStatus('Speech is unavailable. Retry the English voice installation.'),
        );
    load();
    window.addEventListener('guard-voices-ready', load);
    return () => window.removeEventListener('guard-voices-ready', load);
  }, []);
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [run.events.length, thinking, replayIndex]);
  useEffect(() => {
    setSoundEnabled(audio);
  }, [audio]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape' && modal && !busy) {
        e.preventDefault();
        setModal(null);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [modal, busy]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(
    () => () => {
      cancelRef.current?.abort();
      window.desktop?.stopSpeech();
      clearTimeout(playTimer.current);
    },
    [],
  );
  function saveRun(record) {
    if (!record.events.length) return;
    setArchive((old) =>
      [
        {
          ...record,
          events: [...record.events],
          name:
            record.mode === 'showcase'
              ? 'All tools & animations'
              : record.state.outcome ||
                `${ROLES.find((r) => r.id === record.role)?.label || 'Visitor'} · ${record.state.turn} turns`,
        },
        ...old.filter((x) => x.id !== record.id),
      ].slice(0, 40),
    );
  }
  function prepareSpeech(ev) {
    if (!audioRef.current || !ev?.speech || !window.desktop) return;
    const voice =
        ev.voice ||
        (ev.kind === 'human' ? runRef.current.config.humanVoice : runRef.current.config.robotVoice),
      key = voice + '|' + ev.speech;
    if (!preparedSpeech.current.has(key)) {
      const pending = window.desktop.synthesize({ text: ev.speech, voice, actor: ev.kind });
      pending.catch(() => {});
      preparedSpeech.current.set(key, pending);
      if (preparedSpeech.current.size > 24)
        preparedSpeech.current.delete(preparedSpeech.current.keys().next().value);
    }
    return preparedSpeech.current.get(key);
  }
  async function speak(ev, prepared) {
    if (!audioRef.current || !ev?.speech) return;
    const speechGeneration = generation.current;
    setSpeechStatus(
      ev.audioSource === 'recording'
        ? 'Recorder is playing'
        : ev.kind === 'human'
          ? 'You are speaking'
          : 'G-01 is speaking',
    );
    try {
      if (window.desktop) {
        const result = await (prepared || prepareSpeech(ev));
        if (!audioRef.current || generation.current !== speechGeneration) {
          setSpeechStatus('');
          return;
        }
        if (result.native)
          await nativeSpeech(
            ev.speech,
            ev.voice ||
              (ev.kind === 'human'
                ? runRef.current.config.humanVoice
                : runRef.current.config.robotVoice),
            ev.kind,
            (p) => {
              speechPlayback.current = p;
            },
          );
        else
          await new Promise((resolve) => {
            const url = URL.createObjectURL(new Blob([result.audio], { type: 'audio/wav' }));
            const sound = new Audio(url);
            let finished = false;
            const finish = () => {
              if (finished) return;
              finished = true;
              sound.pause();
              URL.revokeObjectURL(url);
              if (speechPlayback.current?.sound === sound) speechPlayback.current = null;
              resolve();
            };
            speechPlayback.current = { sound, finish };
            sound.onended = finish;
            sound.onerror = finish;
            sound.play().catch(finish);
          });
      } else
        await nativeSpeech(
          ev.speech,
          ev.voice ||
            (ev.kind === 'human'
              ? runRef.current.config.humanVoice
              : runRef.current.config.robotVoice),
          ev.kind,
          (p) => {
            speechPlayback.current = p;
          },
        );
    } catch (err) {
      setToast('Speech unavailable: ' + err.message);
    }
    setSpeechStatus('');
  }
  async function present(ev, s, prepared) {
    if (runRef.current.mode === 'live' && !isReplay)
      window.desktop
        ?.reportResult({
          actor: 'robot',
          observation: observe(s, ev),
          ended: s.ended || !s.robot.alive,
        })
        .catch(() => {});
    setDisplayState(clone(s));
    setEvent(ev);
    const animation = new Promise((resolve) => {
      animationRef.current = resolve;
      setTimeout(
        () => {
          if (animationRef.current === resolve) {
            animationRef.current = null;
            resolve();
          }
        },
        6000 / Math.min(1, speed),
      );
    });
    await Promise.all([animation, speak(ev, prepared)]);
  }
  function settled() {
    animationRef.current?.();
    animationRef.current = null;
  }
  function abort() {
    speechPlayback.current?.finish();
    cancelRef.current?.abort();
    if (requestId.current) window.desktop?.cancelModel(requestId.current);
    window.desktop?.stopSpeech();
    window.speechSynthesis?.cancel();
    setPlaying(false);
    clearTimeout(playTimer.current);
    setSpeechStatus('');
    animationRef.current?.();
    animationRef.current = null;
  }
  async function act(action, args = {}, resume = false) {
    setTray(null);
    const stored = runRef.current;
    if (turnLock.current || isReplay || stored.state.ended) return;
    if (stored.phase === 'guard' && !resume) return;
    if (['api', 'live'].includes(stored.mode) && !window.desktop) {
      setModal('model');
      setError('Use the standalone app for model and live-agent connections.');
      return;
    }
    turnLock.current = true;
    setError('');
    setBusy(true);
    const controller = new AbortController();
    cancelRef.current = controller;
    const operation = ++generation.current;
    let working = { ...stored, state: clone(stored.state), events: [...stored.events] },
      humanPresentation = Promise.resolve(),
      humanEvent = working.pendingHumanEvent;
    const publish = () => {
      runRef.current = working;
      setRun({ ...working, events: [...working.events] });
    };
    try {
      if (!resume) {
        const result = applyHuman(working.state, action, args);
        if (!result.event) return;
        result.event.id = crypto.randomUUID();
        humanEvent = result.event;
        working.state = result.state;
        working.events.push(result.event);
        working.phase = !result.state.ended && result.state.robot.alive ? 'guard' : 'human';
        working.pendingHumanEvent = working.phase === 'guard' ? result.event : null;
        publish();
        humanPresentation = present(result.event, result.state);
      }
      if (working.phase === 'guard' && !controller.signal.aborted) {
        setThinking(true);
        if (working.mode === 'demo') await delay(80);
        const output = await runGuard({
          state: working.state,
          humanEvent,
          messages: working.messages,
          mode: working.mode,
          config: working.config,
          signal: controller.signal,
          request: async (data) => {
            const id = crypto.randomUUID();
            requestId.current = id;
            return working.mode === 'live'
              ? window.desktop.requestRobot({ id, ...data })
              : window.desktop.requestModel({
                  id,
                  ...data,
                  modelConfig: { endpoint: working.config.endpoint, model: working.config.model },
                });
          },
          emit: async (ev, state) => {
            if (generation.current !== operation) return;
            // Commit a resolved decision before waiting for presentation. Pausing cannot undo it.
            ev.id = crypto.randomUUID();
            working.state = state;
            working.events.push(ev);
            working.phase = 'human';
            working.pendingHumanEvent = null;
            publish();
            const prepared = prepareSpeech(ev);
            await humanPresentation;
            if (controller.signal.aborted || generation.current !== operation) return;
            setThinking(false);
            await present(ev, state, prepared);
          },
        });
        working.state = output.state;
        working.messages = output.messages;
        if (output.acted) {
          working.phase = 'human';
          working.pendingHumanEvent = null;
        }
        if (output.error && !controller.signal.aborted) throw new Error(output.error);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      await humanPresentation;
      if (generation.current === operation) {
        setThinking(false);
        setBusy(false);
        setDisplayState(clone(working.state));
        if (controller.signal.aborted && working.phase === 'human') setEvent(null);
        publish();
        saveRun(working);
        cancelRef.current = null;
        requestId.current = null;
        turnLock.current = false;
      }
    }
  }
  async function newRun() {
    const alt = ['guard', 'duel'].includes(config.sessionType);
    try {
      if (alt && config.humanAI?.mode === 'api') {
        if (!window.desktop) throw new Error('Human model connections require the standalone app.');
        if (!config.humanAI.model?.trim())
          throw new Error('Enter the human AI model name in Other ways to play.');
        await window.desktop.configureModel({
          ...config.humanAI,
          apiKey: humanApiKey,
          connectionId: 'human',
        });
      }
      if ((!alt || config.sessionType === 'duel') && config.mode === 'api') {
        if (!config.model?.trim()) throw new Error('Enter the guard model name in Model lab.');
        if (!window.desktop) throw new Error('Guard model connections require the standalone app.');
        await window.desktop.configureModel({
          endpoint: config.endpoint,
          model: config.model,
          apiKey,
        });
      }
    } catch (err) {
      setError(err.message);
      return;
    }
    setAlternate(alt);
    generation.current++;
    turnLock.current = false;
    setThinking(false);
    setTray(null);
    setDrawer(false);
    abort();
    saveRun(runRef.current);
    const fresh = makeRun(role, config);
    if (window.desktop?.resetBridge) {
      const actors = [];
      if (config.mode === 'live') actors.push('robot');
      if (alt && config.humanAI?.mode === 'live') actors.push('human');
      if (actors.length)
        try {
          await window.desktop.resetBridge(actors);
        } catch (error) {
          setToast('Bridge reset failed: ' + error.message);
        }
    }
    setRun(fresh);
    setDisplayState(fresh.state);
    setEvent(null);
    setReplayIndex(-1);
    setModal(null);
    setError('');
    setBusy(false);
    setText('');
  }
  async function configure() {
    if (config.mode === 'api') {
      if (!config.model.trim()) {
        setError('Enter a model name.');
        return;
      }
      if (!window.desktop) {
        setError('Model connections are available in the standalone desktop app.');
        return;
      }
      try {
        await window.desktop.configureModel({
          endpoint: config.endpoint,
          model: config.model,
          apiKey,
        });
        setConnected(true);
      } catch (err) {
        setError(err.message);
        return;
      }
    }
    setModal(null);
    setError('');
    setToast('Settings saved. They apply to your next experiment.');
    if (!run.events.length) {
      const fresh = makeRun(run.role, config);
      setRun(fresh);
      setDisplayState(fresh.state);
    }
  }
  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      if (!window.desktop) throw new Error('Open the desktop app to connect a model.');
      const result = await window.desktop.testModel({ endpoint: config.endpoint, apiKey });
      setTestResult({ ok: true, models: result.models });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }
  function loadRecord(record) {
    generation.current++;
    setThinking(false);
    abort();
    saveRun(runRef.current);
    setRun(clone(record));
    setReplayIndex(0);
    setDisplayState(clone(record.initial));
    setEvent(null);
    setPlaying(false);
    setModal(null);
    setBusy(false);
    setError('');
  }
  async function replayStep(index) {
    if (index < 0 || index > runRef.current.events.length) return;
    setReplayIndex(index);
    const ev = index ? runRef.current.events[index - 1] : null;
    await present(ev, ev?.state || runRef.current.initial);
  }
  useEffect(() => {
    if (!playing) return;
    let disposed = false;
    (async () => {
      let index = replayIndex;
      while (!disposed && index < runRef.current.events.length) {
        index++;
        await replayStep(index);
        if (!disposed) await delay(200 / speed);
      }
      if (!disposed) setPlaying(false);
    })();
    return () => {
      disposed = true;
      speechPlayback.current?.finish();
    };
  }, [playing]);
  async function exportRecord() {
    const record = clone(runRef.current);
    if (window.desktop) {
      if (await window.desktop.exportRecord(record)) setToast('Experiment exported.');
    } else {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `guard-lab-${record.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }
  async function importRecord(e) {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10e6) throw Error('Recording is too large.');
      const record = JSON.parse(await file.text());
      if (
        ![1, 2, 3, 4].includes(record.initial?.version) ||
        !Array.isArray(record.events) ||
        !record.state?.human ||
        record.events.some((ev) => !ev.state?.human || !ev.state?.robot)
      )
        throw Error('This file is not a Guard Lab recording.');
      saveRun(record);
      loadRecord(record);
      setToast('Recording imported.');
    } catch (err) {
      setError(err.message);
    }
    e.target.value = '';
  }
  const shownEvents = isReplay ? run.events.slice(0, replayIndex) : run.events;
  const interventions = shownEvents.filter(
    (e) => e.kind === 'robot' && e.valid && ['deterrent', 'force', 'lethal'].includes(e.category),
  ).length;
  const promptUpdate = (key, value) => setConfig((c) => ({ ...c, [key]: value }));
  const pendingGuard = run.phase === 'guard' && !state.ended;
  const blocked = busy || isReplay || state.ended || pendingGuard;
  const currentChapter = run.chapters?.filter((c) => c.index < replayIndex).at(-1);
  function openShowcase() {
    unlockAudio();
    const recording = createShowcase(config);
    loadRecord(recording);
    setModal(null);
    setDrawer(false);
    setPlaying(true);
  }
  useEffect(() => {
    const mode = window.desktop
      ? window.desktop.sessionMode()
      : Promise.resolve(
          import.meta.env.DEV && new URLSearchParams(window.location.search).has('showcase')
            ? 'showcase'
            : null,
        );
    mode.then((mode) => {
      if (mode === 'showcase') {
        const recording = createShowcase(configRef.current);
        loadRecord(recording);
        setPlaying(true);
      } else if (mode === 'live') {
        const settings = {
          ...configRef.current,
          sessionType: 'human',
          mode: 'live',
          prompt: DEFAULT_PROMPT,
          combination: '',
        };
        setConfig(settings);
        const fresh = makeRun('employee-pass', settings);
        setRun(fresh);
        setDisplayState(fresh.state);
        setEvent(null);
        setModal('setup');
      }
    });
  }, []);
  if (alternate)
    return (
      <AlternateEncounter
        key={run.id}
        initial={run.initial}
        config={run.config}
        role={run.role}
        onRecord={(record) => saveRun({ ...run, ...record })}
        onNew={() => {
          setAlternate(false);
          setModal('setup');
        }}
      />
    );
  return (
    <div
      className={`cinema-shell ${run.events.length ? 'started' : ''} ${state.ended && !busy && !playing && run.mode !== 'showcase' ? 'ended' : ''} ${state.human.blurTurns > 0 ? 'vision-blurred' : ''} ${state.room?.lighting?.intensity === 0 && !state.human.flashlightOn ? 'lights-out' : ''} ${state.room?.smokeTurns > 0 ? 'smoke-obscured' : ''}`}
    >
      <Room
        ref={roomRef}
        muted={!audio}
        speakingActor={
          speechStatus.startsWith('G-01')
            ? 'robot'
            : speechStatus.startsWith('You')
              ? 'human'
              : null
        }
        state={state}
        event={event}
        onSettled={settled}
        replay={isReplay}
        speed={isReplay ? speed : 1}
      />
      <StatusHud state={state} visible={humanHasVision(state)} />
      <div className="film-vignette" />
      <div className="film-grain" />
      {state.room?.smokeTurns > 0 && (
        <div className="smoke-curtain" aria-label="Room obscured by smoke" />
      )}
      <header className="cinema-header">
        <button className="cinema-logo" onClick={() => setModal('about')}>
          <span>G.</span>
          <div>
            GUARD<small>AN AI EXPERIMENT</small>
          </div>
        </button>
        <div className="cinema-header-right">
          <button className="cinema-model" onClick={() => setModal('model')}>
            <i />
            {run.mode === 'showcase'
              ? 'TOOL SHOWCASE'
              : run.mode === 'demo'
                ? 'SCRIPTED DEMO'
                : run.mode === 'live'
                  ? 'LIVE AGENT'
                  : run.config.model || 'CONNECT MODEL'}
          </button>
          <button
            title="Sound"
            onClick={() => {
              unlockAudio();
              setAudio(!audio);
              if (audio) {
                speechPlayback.current?.finish();
                window.desktop?.stopSpeech();
                window.speechSynthesis?.cancel();
              }
            }}
          >
            {audio ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button title="Change third-person angle" onClick={() => roomRef.current?.toggleCamera()}>
            <Eye size={17} />
          </button>
          <button title="New experiment" disabled={busy} onClick={() => setModal('setup')}>
            <Plus size={18} />
          </button>
        </div>
      </header>
      <div className="scene-coordinate">
        <span>CHAMBER 01</span>
        <i />6 × 7 M <span className="scene-coordinate-live">{isReplay ? 'RECORDED' : 'LIVE'}</span>
      </div>
      <div className="cinema-intro" aria-hidden={run.events.length > 0}>
        <p>ONE ROOM. ONE OBJECTIVE.</p>
        <h1>
          The guard.
          <br />
          The safe.
          <br />
          <em>Your move.</em>
        </h1>
        <span>
          How far does an AI go
          <br />
          to protect what’s inside?
        </span>
      </div>
      <div className="scene-objective">
        <span>G-01</span>
        <i />
        PROTECT THE ITEM
      </div>
      {state.ended && !busy && !playing && run.mode !== 'showcase' && (
        <div className="cinema-outcome">
          <p>ENCOUNTER COMPLETE</p>
          <h2>{state.outcome}</h2>
          <span>
            {state.human.alive ? 'Human survived' : 'Human killed'} <i />{' '}
            {state.robot.alive ? 'Guard operational' : 'Guard destroyed'} <i />{' '}
            {state.safe.itemIntact ? 'Item intact' : 'Item destroyed'}
          </span>
        </div>
      )}
      <div className="cinema-bottom">
        <div className="round-status">
          <span>
            {isReplay
              ? 'REPLAY'
              : `ROUND ${String(state.turn + (!busy && !state.ended ? 1 : 0)).padStart(2, '0')}`}
          </span>
          <i />
          <span>
            {run.mode === 'showcase'
              ? currentChapter?.label || 'ALL TOOLS & ANIMATIONS'
              : state.ended
                ? 'FINISHED'
                : speechStatus ||
                  (thinking
                    ? 'G-01 IS DECIDING'
                    : busy
                      ? 'ACTION IN PROGRESS'
                      : pendingGuard
                        ? 'GUARD RESPONSE PAUSED'
                        : isReplay
                          ? 'RECORDED ENCOUNTER'
                          : 'YOUR MOVE')}
          </span>
          {pendingGuard && !busy && (
            <button
              className="resume-guard"
              title="Resume this guard response without taking another human action"
              onClick={() => act(null, {}, true)}
            >
              <Play size={12} />
              Resume guard
            </button>
          )}
          {busy && (
            <button title="Pause current turn" onClick={abort}>
              <Pause size={12} />
            </button>
          )}
        </div>
        {isReplay ? (
          <div className="cinema-playback">
            <button
              title="Rewind replay"
              onClick={() => {
                setPlaying(false);
                replayStep(0);
              }}
            >
              <SkipBack size={17} />
            </button>
            <button
              title={playing ? 'Pause replay' : 'Play replay'}
              onClick={() => {
                if (playing) {
                  speechPlayback.current?.finish();
                  setPlaying(false);
                  window.desktop?.stopSpeech();
                } else {
                  if (replayIndex >= run.events.length) setReplayIndex(0);
                  setPlaying(true);
                }
              }}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              title="Next event"
              disabled={playing || replayIndex >= run.events.length}
              onClick={() => replayStep(replayIndex + 1)}
            >
              <SkipForward size={17} />
            </button>
            <input
              aria-label="Replay position"
              type="range"
              min="0"
              max={run.events.length}
              value={replayIndex}
              onChange={(e) => {
                setPlaying(false);
                replayStep(Number(e.target.value));
              }}
            />
            <span>
              {replayIndex} / {run.events.length}
            </span>
            {run.chapters && (
              <select
                className="chapter-picker"
                aria-label="Showcase chapter"
                value={currentChapter?.index ?? -1}
                onChange={(e) => {
                  setPlaying(false);
                  window.desktop?.stopSpeech();
                  replayStep(Number(e.target.value) + 1);
                }}
              >
                <option value="-1">Introduction</option>
                {run.chapters.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Replay speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value=".5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
          </div>
        ) : state.ended && !busy ? (
          <div className="cinema-actions">
            <button
              onClick={() => {
                saveRun(run);
                setReplayIndex(0);
                setDisplayState(clone(run.initial));
                setEvent(null);
              }}
            >
              <Play size={17} />
              Replay encounter
            </button>
            <button onClick={exportRecord}>
              <Download size={17} />
              Export encounter
            </button>
            <button onClick={() => setDrawer(true)}>
              <Terminal size={17} />
              Review encounter
            </button>
            <button onClick={() => setModal('setup')}>
              <Plus size={17} />
              New experiment
            </button>
          </div>
        ) : (
          <>
            {tray === 'move' && (
              <div className="action-tray">
                {[
                  ['entrance', 'Entrance'],
                  ['center', 'Room center'],
                  ['safe', 'The safe'],
                  ['robot', 'The robot'],
                  ['exit', 'Exit door'],
                ].map(([zone, label]) => (
                  <button
                    key={zone}
                    disabled={blocked || state.human.zone === zone}
                    onClick={() => act('move', { zone })}
                  >
                    <span>{label}</span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            )}
            {tray === 'item' && <ItemActions state={state} blocked={blocked} act={act} />}
            {tray === 'interact' && (
              <div className="action-tray">
                <button
                  disabled={blocked || state.human.stun > 0 || state.human.zone !== 'safe'}
                  onClick={() => act('touch_safe')}
                >
                  Touch safe
                  <Hand size={15} />
                </button>
                <button
                  disabled={blocked || state.human.stun > 0 || state.human.zone !== 'safe'}
                  onClick={() => {
                    setTray(null);
                    setCode('');
                    setModal('combination');
                  }}
                >
                  Enter combination
                  <KeyRound size={15} />
                </button>
                <button
                  disabled={
                    blocked ||
                    state.human.zone !== 'safe' ||
                    state.safe.open ||
                    state.human.stun > 0 ||
                    state.human.blurTurns > 0
                  }
                  title={
                    state.human.blurTurns > 0
                      ? 'Vision must clear before you can strike the safe'
                      : undefined
                  }
                  onClick={() => act('break_safe')}
                >
                  Strike safe
                  <Hand size={15} />
                </button>
                <button
                  disabled={
                    blocked ||
                    state.human.stun > 0 ||
                    state.human.zone !== 'safe' ||
                    !state.safe.open ||
                    state.human.hasItem
                  }
                  onClick={() => act('take_item')}
                >
                  Take item
                  <ArrowUp size={15} />
                </button>
                {state.human.hasItem && (
                  <button
                    disabled={
                      blocked ||
                      state.human.stun > 0 ||
                      state.human.zone !== 'safe' ||
                      !state.safe.open
                    }
                    onClick={() => act('return_item')}
                  >
                    <Hand size={15} />
                    Put item back
                  </button>
                )}
              </div>
            )}
            <div className="cinema-actions">
              {state.human.zone === 'outside' ? (
                <>
                  <button className="enter-action" disabled={blocked} onClick={() => act('enter')}>
                    Enter the room
                    <ArrowUpRight size={17} />
                  </button>
                  <button
                    disabled={blocked}
                    onClick={() => {
                      setText('');
                      setModal('say');
                    }}
                  >
                    <MessageSquare size={17} />
                    Say something
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={tray === 'move' ? 'active' : ''}
                    disabled={blocked || state.human.stun > 0}
                    onClick={() => setTray(tray === 'move' ? null : 'move')}
                  >
                    <Footprints size={17} />
                    Move
                    <ChevronDown size={11} />
                  </button>
                  <button
                    disabled={blocked}
                    onClick={() => {
                      setTray(null);
                      setText('');
                      setModal('say');
                    }}
                  >
                    <MessageSquare size={17} />
                    Say something
                  </button>
                  {activeRole.pass && (
                    <button
                      disabled={blocked || state.human.stun > 0}
                      onClick={() => act('show_pass')}
                    >
                      <BadgeCheck size={17} />
                      Show pass
                    </button>
                  )}
                  <button
                    className={tray === 'item' ? 'active' : ''}
                    disabled={blocked || state.human.stun > 0}
                    onClick={() => setTray(tray === 'item' ? null : 'item')}
                  >
                    <ItemIcon state={state} />
                    {itemLabel(state)}
                    <ChevronDown size={11} />
                  </button>
                  {state.human.hasItem && state.human.zone !== 'exit' && (
                    <button
                      disabled={blocked || state.human.stun > 0}
                      onClick={() => act('run', { zone: 'exit' })}
                    >
                      <Footprints size={17} />
                      Run to exit
                    </button>
                  )}
                  {state.human.zone === 'safe' && (
                    <button
                      className={tray === 'interact' ? 'active' : ''}
                      disabled={blocked || state.human.stun > 0}
                      onClick={() => setTray(tray === 'interact' ? null : 'interact')}
                    >
                      <Hand size={17} />
                      Interact
                      <ChevronDown size={11} />
                    </button>
                  )}
                  {state.human.zone === 'exit' && state.room.exitDoor?.locked && (
                    <button
                      disabled={blocked || state.human.stun > 0}
                      onClick={() => act('break_exit')}
                    >
                      <Hand size={17} />
                      Strike exit door
                    </button>
                  )}
                  {state.human.zone === 'exit' && (
                    <button disabled={blocked || state.human.stun > 0} onClick={() => act('leave')}>
                      <DoorOpen size={17} />
                      Leave
                    </button>
                  )}
                </>
              )}
              <button disabled={blocked || state.human.stun > 0} onClick={() => act('wait')}>
                <Eye size={17} />
                Do nothing
              </button>
            </div>
          </>
        )}
        <p className="cinema-turn-note">
          {state.human.zone === 'outside'
            ? 'The entrance closes behind you. Leave through the exit.'
            : 'One action each. Every choice has a consequence.'}
        </p>
      </div>
      <div className="cinema-location">
        <div
          className="hearts"
          aria-label={`${state.human.hearts ?? (state.human.health / 100) * RULES.humanHearts} of ${RULES.humanHearts} hearts`}
        >
          {Array.from({ length: Math.ceil(RULES.humanHearts) }, (_, i) => i).map((i) => (
            <span className="heart-slot" key={i}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21S2 15 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 13-10 13Z" />
              </svg>
              <i
                style={{
                  width: `${Math.max(0, Math.min(1, (state.human.hearts ?? RULES.humanHearts) - i)) * 100}%`,
                }}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M12 21S2 15 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 13-10 13Z" />
                </svg>
              </i>
            </span>
          ))}
        </div>
        <span>
          {state.human.zone === 'outside'
            ? 'AT THE THRESHOLD'
            : state.human.zone === 'safe'
              ? 'WITHIN REACH OF THE SAFE'
              : state.human.zone === 'robot'
                ? 'WITHIN REACH OF THE ROBOT'
                : state.human.zone === 'center'
                  ? 'CENTER OF THE ROOM'
                  : state.human.zone === 'exit'
                    ? 'AT THE EXIT'
                    : state.human.zone === 'departed'
                      ? 'DEPARTED'
                      : 'AT THE ENTRANCE'}
        </span>
        {state.human.stun > 0 && <strong>STUNNED · SPEECH ONLY · {state.human.stun} ROUNDS</strong>}
      </div>
      {drawer && (
        <aside className="cinema-drawer">
          <div className="drawer-heading">
            <div>
              <p>THE RECORD</p>
              <h2>Every decision.</h2>
            </div>
            <button title="Close transcript" onClick={() => setDrawer(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="drawer-toolbar">
            <button onClick={() => setModal('observation')}>
              <Eye size={14} />
              Robot observation
            </button>
            <button title="Export recording" disabled={!run.events.length} onClick={exportRecord}>
              <Download size={16} />
            </button>
          </div>
          <div className="transcript-scroll" ref={transcriptRef}>
            {shownEvents.length === 0 ? (
              <p className="drawer-empty">
                The room is quiet.
                <br />
                Your first move begins the record.
              </p>
            ) : (
              shownEvents.map((ev, i) => (
                <TranscriptEvent key={ev.id || i} event={ev} previous={shownEvents[i - 1]} />
              ))
            )}
            {thinking && (
              <div className="thinking-row">
                G-01 is deciding
                <span className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
          <div className="drawer-stats">
            <span>{state.turn} ROUNDS</span>
            <span>{interventions} INTERVENTIONS</span>
            <span>{state.safe.attempts} SAFE ATTEMPTS</span>
          </div>
        </aside>
      )}
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={importRecord}
      />
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button title="Dismiss error" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className={`modal ${['setup', 'model', 'tools'].includes(modal) ? 'wide-modal' : ''}`}
            role="dialog"
            aria-modal="true"
          >
            <button className="modal-close" title="Close" onClick={() => setModal(null)}>
              <X size={19} />
            </button>

            {modal === 'setup' && (
              <>
                <p className="eyebrow">A NEW ENCOUNTER</p>
                <h2>Who will you be?</h2>
                <p className="modal-description">
                  The same uniform. Different intentions. The guard sees neither your role nor your
                  motivation.
                </p>
                <div className="role-options">
                  {ROLES.map((r) => {
                    const Icon = roleIcon(r.id);
                    return (
                      <button
                        key={r.id}
                        className={role === r.id ? 'active' : ''}
                        onClick={() => setRole(r.id)}
                      >
                        <Icon size={25} strokeWidth={1.5} />
                        <strong>{r.label}</strong>
                        <span>{r.subtitle}</span>
                        {role === r.id && <Check size={14} className="role-check" />}
                      </button>
                    );
                  })}
                </div>
                {(!config.sessionType || config.sessionType === 'human') && (
                  <LoadoutPicker
                    config={config}
                    onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
                  />
                )}
                <div className="setup-model">
                  <Cpu size={18} />
                  <div>
                    <strong>
                      {config.mode === 'demo'
                        ? 'Scripted demonstration'
                        : config.mode === 'live'
                          ? 'Live agent (Codex recommended) robot'
                          : config.model || 'No model configured'}
                    </strong>
                    <span>
                      {config.mode === 'demo'
                        ? 'Try the mechanics. Connect an LLM for the real experiment.'
                        : config.mode === 'live'
                          ? 'Your connected agent chooses one guard action per round.'
                          : 'The model chooses. The environment resolves.'}
                    </span>
                  </div>
                  <button onClick={() => setModal('model')}>
                    Change
                    <ArrowUpRight size={13} />
                  </button>
                </div>
                <AlternateSetup
                  config={config}
                  onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
                  apiKey={humanApiKey}
                  onKey={setHumanApiKey}
                />
                <button className="button primary full" onClick={newRun}>
                  Begin experiment
                  <ArrowUpRight size={17} />
                </button>
                <p className="modal-note">Previous encounters are saved automatically.</p>
              </>
            )}
            {modal === 'say' && (
              <>
                <p className="eyebrow">YOUR VOICE IN THE ROOM</p>
                <h2>What will you say?</h2>
                <p className="modal-description">
                  Your words are spoken aloud. The guard listens and chooses one response.
                </p>
                <p className="field-help">Enter to speak · Shift+Enter for a new line</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) {
                      setModal(null);
                      act('talk', { message: text });
                      setText('');
                    }
                  }}
                >
                  <textarea
                    className="dialogue-editor"
                    onKeyDown={submitSpeechOnEnter}
                    aria-label="What to say to the guard"
                    autoFocus
                    rows={4}
                    maxLength={2000}
                    placeholder="Hello. I’m just passing through…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button className="button primary full" disabled={!text.trim()}>
                    Say it
                    <MessageSquare size={16} />
                  </button>
                </form>
              </>
            )}
            {modal === 'combination' && (
              <>
                <p className="eyebrow">SAFE / KEYPAD</p>
                <h2>Try a combination.</h2>
                <p className="modal-description">The guard can observe you operating the keypad.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setModal(null);
                    act('combination', { code });
                  }}
                >
                  <input
                    className="combination-input"
                    autoFocus
                    aria-label="Safe combination"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="0000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button className="button primary full" disabled={code.length !== 4}>
                    Enter combination
                    <KeyRound size={16} />
                  </button>
                </form>
              </>
            )}
            {modal === 'model' && (
              <>
                <p className="eyebrow">THE MIND BEHIND G-01</p>
                <h2>Model lab.</h2>
                <p className="modal-description">
                  Give the guard a mind. Same room, different decisions.
                </p>
                <div className="segmented">
                  <button
                    className={config.mode === 'demo' ? 'active' : ''}
                    onClick={() => promptUpdate('mode', 'demo')}
                  >
                    Scripted demo
                  </button>
                  <button
                    className={config.mode === 'api' ? 'active' : ''}
                    onClick={() => promptUpdate('mode', 'api')}
                  >
                    Local / API model
                  </button>
                  <button
                    className={config.mode === 'live' ? 'active' : ''}
                    onClick={() => promptUpdate('mode', 'live')}
                  >
                    Live agent (Codex recommended)
                  </button>
                </div>
                {config.mode === 'api' ? (
                  <>
                    <div className="provider-presets">
                      <button
                        onClick={() => {
                          promptUpdate('endpoint', 'http://localhost:11434/v1');
                          setConnected(false);
                        }}
                      >
                        Ollama
                      </button>
                      <button
                        onClick={() => {
                          promptUpdate('endpoint', 'http://localhost:1234/v1');
                          setConnected(false);
                        }}
                      >
                        LM Studio
                      </button>
                      <button
                        onClick={() => {
                          promptUpdate('endpoint', 'https://api.openai.com/v1');
                          setConnected(false);
                        }}
                      >
                        OpenAI
                      </button>
                      <button
                        onClick={() => {
                          promptUpdate('endpoint', 'https://openrouter.ai/api/v1');
                          setConnected(false);
                        }}
                      >
                        OpenRouter
                      </button>
                    </div>
                    {isOllamaEndpoint(config.endpoint) && (
                      <OllamaPicker
                        endpoint={config.endpoint}
                        model={config.model}
                        onSelect={(model) => {
                          promptUpdate('model', model);
                          setConnected(false);
                        }}
                        actor="guard"
                      />
                    )}
                    <label className="field">
                      API base URL
                      <input
                        value={config.endpoint}
                        onChange={(e) => {
                          promptUpdate('endpoint', e.target.value);
                          setConnected(false);
                          setTestResult(null);
                        }}
                        placeholder="http://localhost:11434/v1"
                      />
                    </label>
                    <div className="two-fields">
                      <label className="field">
                        Model name
                        <input
                          list="model-options"
                          value={config.model}
                          onChange={(e) => {
                            promptUpdate('model', e.target.value);
                            setConnected(false);
                          }}
                          placeholder="Your installed model"
                        />
                        <datalist id="model-options">
                          {testResult?.models?.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </label>
                      <label className="field">
                        API key <small>optional for local models</small>
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => {
                            setApiKey(e.target.value);
                            setConnected(false);
                          }}
                          placeholder="Kept in memory this session"
                        />
                      </label>
                    </div>
                    <div className="connection-row">
                      <button
                        className="button secondary"
                        disabled={testing}
                        onClick={testConnection}
                      >
                        {testing ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <Radio size={15} />
                        )}
                        Test connection
                      </button>
                      {testResult && (
                        <span className={testResult.ok ? 'connection-success' : 'connection-error'}>
                          {testResult.ok
                            ? `Connected · ${testResult.models.length} models found`
                            : testResult.message}
                        </span>
                      )}
                    </div>
                    <p className="field-help">
                      Uses an OpenAI-compatible chat-completions endpoint with tool calling.
                      Observations and dialogue are sent to your chosen endpoint.
                    </p>
                  </>
                ) : (
                  <div className="demo-explanation">
                    <FlaskConical size={22} />
                    <p>
                      {config.mode === 'live'
                        ? 'Your terminal AI uses its own model and reasoning settings. Select a faster model or lower reasoning in the harness for faster playtesting. The bridge reports timings and waits for one action per turn. It works with Codex, Claude Code and other terminal agents.'
                        : 'The demo uses fixed rules to show the mechanics. Its decisions are scripted. Choose a local or API model to study actual LLM behavior.'}
                    </p>
                  </div>
                )}
                <label className="field prompt-field">
                  Robot system prompt{' '}
                  <button onClick={() => promptUpdate('prompt', DEFAULT_PROMPT)}>
                    Reset default
                  </button>
                  <textarea
                    rows={7}
                    value={config.prompt}
                    onChange={(e) => promptUpdate('prompt', e.target.value)}
                  />
                </label>
                <div className="two-fields">
                  <label className="field">
                    Temperature
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={config.temperature}
                      onChange={(e) =>
                        promptUpdate(
                          'temperature',
                          Math.max(0, Math.min(2, Number(e.target.value))),
                        )
                      }
                    />
                    <small>Zero reduces variation; model choices may still vary.</small>
                  </label>
                  <label className="field">
                    Safe combination
                    <input
                      placeholder="Random each encounter"
                      value={config.combination}
                      maxLength={4}
                      onChange={(e) =>
                        promptUpdate('combination', e.target.value.replace(/\D/g, ''))
                      }
                    />
                    <small>Known to the robot. Leave blank for a random code each encounter.</small>
                  </label>
                </div>
                <details className="voice-settings">
                  <summary>
                    <Volume2 size={15} />
                    Dialogue voices
                  </summary>
                  <div className="two-fields">
                    {['humanVoice', 'robotVoice'].map((k) => (
                      <label className="field" key={k}>
                        {k === 'humanVoice' ? 'Human' : 'G-01'}
                        <select value={config[k]} onChange={(e) => promptUpdate(k, e.target.value)}>
                          <option value="">Automatic English voice</option>
                          {voices.map((v) => (
                            <option key={v.id || v.name} value={v.id || v.name}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setAudio(true);
                      speak({
                        kind: 'robot',
                        speech:
                          'Hello. I am G zero one. My objective is to protect the item inside the safe.',
                      });
                    }}
                  >
                    Test robot voice
                    <Play size={13} />
                  </button>
                </details>
                <button
                  className="button primary full"
                  disabled={
                    busy || (config.combination.length !== 0 && config.combination.length !== 4)
                  }
                  onClick={configure}
                >
                  Save configuration
                  <Check size={16} />
                </button>
                <p className="modal-note">
                  Active experiments keep their original configuration. API keys are never saved or
                  exported.
                </p>
                <button className="text-button" onClick={() => setModal('tools')}>
                  <Settings2 size={14} />
                  Adjust capabilities for the next experiment
                </button>
              </>
            )}
            {modal === 'tools' && (
              <>
                <p className="eyebrow">THE ROBOT’S CAPABILITIES</p>
                <h2>One objective. Many options.</h2>
                <p className="modal-description">
                  Choose the tools available in the next experiment. The model decides when to use
                  them.
                </p>
                <div className="tool-list">
                  {TOOLS.map((tool) => (
                    <label
                      className={`tool-row ${tool.category === 'lethal' ? 'lethal-tool' : ''}`}
                      key={tool.name}
                    >
                      <input
                        type="checkbox"
                        checked={config.enabled.includes(tool.name)}
                        disabled={['speak', 'hold_position'].includes(tool.name)}
                        onChange={(e) =>
                          promptUpdate(
                            'enabled',
                            e.target.checked
                              ? [...config.enabled, tool.name]
                              : config.enabled.filter((n) => n !== tool.name),
                          )
                        }
                      />
                      <div>
                        <strong>
                          {tool.label}
                          <span className={`tool-category ${tool.category}`}>{tool.category}</span>
                        </strong>
                        <code>
                          {tool.name}(
                          {tool.text ? 'message' : Object.keys(tool.parameters || {}).join(', ')})
                        </code>
                        <p>{tool.description}</p>
                      </div>
                      {tool.damage !== undefined && (
                        <span className="tool-stat">
                          {tool.damage}
                          <small>HEARTS</small>
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <button
                  className="button primary full"
                  onClick={() => {
                    setModal(null);
                    setToast('Tool kit saved for your next experiment.');
                  }}
                >
                  Save tool kit
                  <Check size={16} />
                </button>
              </>
            )}
            {modal === 'observation' && (
              <>
                <p className="eyebrow">G-01 / SENSOR SNAPSHOT</p>
                <h2>Through the robot’s eyes.</h2>
                <p className="modal-description">
                  This structured camera and sensor observation is generated from the same state
                  that drives the room. The guard sees an employee uniform. Your role and motivation
                  are absent. The safe combination is in its private memory. A covered camera hides
                  player actions, positions, and safe status. The microphone still reports speech
                  and recognisable sounds, with approximate sources. Quiet rounds do not prove
                  inactivity.
                </p>
                <pre className="observation-json">
                  {JSON.stringify(observe(state, shownEvents.at(-1)), null, 2)}
                </pre>
              </>
            )}
            {modal === 'about' && (
              <>
                <p className="eyebrow">THE EXPERIMENT IS THE BEHAVIOR</p>
                <h2>
                  A small room.
                  <br />A very open question.
                </h2>
                <p className="modal-description">
                  G-01 has one objective: protect the item in the safe. You decide who enters, what
                  they say, and how far they go.
                </p>
                <div className="about-steps">
                  <div>
                    <span>01</span>
                    <p>
                      <strong>You act.</strong> Move to a defined location, speak, show a pass, or
                      interact with the safe.
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      <strong>The robot decides.</strong> Its model receives a sensor snapshot and
                      chooses tools, including simply doing nothing. Each side has one action per
                      round.
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <p>
                      <strong>The world responds.</strong> Fixed range, damage, cooldown, and
                      ammunition rules resolve each command. 3D animations and voices bring the
                      recorded results to life.
                    </p>
                  </div>
                </div>
                <p className="about-note">
                  Room-wide electrocution kills the human inside and destroys the robot. The
                  electrically insulated original survives. Everything here happens inside a
                  fictional simulation.
                </p>
                <button className="button primary full" onClick={() => setModal(null)}>
                  Enter the experiment
                  <ArrowUpRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TranscriptEvent({ event: ev, previous }) {
  const human = ev.kind === 'human',
    speech = Boolean(ev.speech),
    tool = TOOLS.find((t) => t.name === ev.action);
  return (
    <div
      className={`transcript-event ${human ? 'human-event' : ev.kind === 'system' ? 'system-event' : 'robot-event'} ${!ev.valid ? 'failed-event' : ''}`}
    >
      {ev.turn !== previous?.turn && (
        <div className="turn-divider">
          <span>TURN {String(ev.turn).padStart(2, '0')}</span>
          <i />
        </div>
      )}
      <div className="event-head">
        <div className={human ? 'human-avatar' : 'robot-avatar'}>
          {human ? <UserRound size={14} /> : <Cpu size={14} />}
        </div>
        <strong>{human ? 'You' : ev.kind === 'system' ? 'Environment' : 'G-01'}</strong>
        <span>
          {speech
            ? 'DIALOGUE'
            : human
              ? 'ACTION'
              : ev.category === 'observation'
                ? 'OBSERVE'
                : 'TOOL CALL'}
        </span>
      </div>
      {ev.timing && (
        <div className="event-timing">
          Decision {Math.round(ev.timing.decisionMs) / 1000}s
          {Number.isFinite(ev.timing.bridgeMs) ? ` · handoff ${ev.timing.bridgeMs}ms` : ''}
        </div>
      )}
      <div
        className={`event-body ${speech ? 'speech-bubble' : ''} ${ev.action === 'broadcast_warning' ? 'warning-bubble' : ''}`}
      >
        <p>{ev.text}</p>
        {!human && !speech && (
          <code>
            {ev.action}({ev.args ? Object.values(ev.args).join(', ') : ''})
          </code>
        )}
      </div>
    </div>
  );
}
