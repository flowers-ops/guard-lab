import { submitSpeechOnEnter } from './ui/keyboard.mjs';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Eye,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
  X,
  Settings2,
} from 'lucide-react';
import { StatusHud } from './StatusHud.jsx';
import { Room } from './scene/Chamber.jsx';
import { TOOLS } from './sim/tools.mjs';
import {
  initialState,
  applyTool,
  observe,
  clone,
  distance,
  ROBOT_POS,
  availableTools,
} from './sim/engine.mjs';
import { createMessages, runGuard } from './sim/agent.mjs';
import {
  humanMessages,
  chooseHumanLoadout,
  humanDecision,
  humanObservation,
} from './sim/human-agent.mjs';
import { unlockAudio, setSoundEnabled } from './audio/sfx.mjs';
import { nativeSpeech } from './audio/speech.mjs';
import { prepareVoice } from './audio/prepare.mjs';
export default function AlternateEncounter({ initial, config, role, onNew, onRecord }) {
  const [state, setState] = useState(initial),
    [event, setEvent] = useState(null),
    [status, setStatus] = useState('Preparing human AI'),
    [paused, setPaused] = useState(false),
    [presenting, setPresenting] = useState(false),
    [awaitRobot, setAwaitRobot] = useState(false),
    [audio, setAudio] = useState(true),
    [tray, setTray] = useState(null),
    [message, setMessage] = useState(''),
    [speechOpen, setSpeechOpen] = useState(false),
    [sensorOpen, setSensorOpen] = useState(false),
    [error, setError] = useState(''),
    [speaking, setSpeaking] = useState(null);
  const room = useRef(),
    store = useRef({
      state: initial,
      humanMessages: humanMessages(role),
      robotMessages: createMessages(config.prompt, initial.combination),
      phase: 'human',
      lastRobotEvent: null,
      initial,
      events: [],
      initialized: false,
    }),
    control = useRef(),
    requestIds = useRef(new Set()),
    settle = useRef(),
    robotReply = useRef(),
    sound = useRef(),
    audioRef = useRef(true),
    mounted = useRef(true),
    running = useRef(false);
  audioRef.current = audio;
  const guardPlayer = config.sessionType === 'guard',
    humanAI = config.humanAI || { mode: 'demo' },
    snapshot = observe(state, event?.kind === 'human' ? event : store.current.humanEvent),
    blind = guardPlayer && !['full', 'beam'].includes(snapshot.camera.vision);
  useEffect(() => {
    setSoundEnabled(audio);
  }, [audio]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') {
        setSpeechOpen(false);
        setSensorOpen(false);
        setTray(null);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  const request = async (data, actor) => {
    if (!window.desktop) throw new Error('Model connections require the standalone app.');
    const id = crypto.randomUUID();
    requestIds.current.add(id);
    try {
      if (
        (actor === 'robot' && config.mode === 'live') ||
        (actor === 'human' && humanAI.mode === 'live')
      )
        return await window.desktop.requestRobot({ id, ...data, actor });
      const selected =
        actor === 'human'
          ? { endpoint: humanAI.endpoint, model: humanAI.model, connectionId: 'human' }
          : { endpoint: config.endpoint, model: config.model };
      return await window.desktop.requestModel({ id, ...data, modelConfig: selected });
    } finally {
      requestIds.current.delete(id);
    }
  };
  async function present(ev, s) {
    if (config.mode === 'live')
      window.desktop
        ?.reportResult({
          actor: 'robot',
          observation: observe(s, ev),
          ended: s.ended || !s.robot.alive,
        })
        .catch(() => {});
    if (humanAI.mode === 'live')
      window.desktop
        ?.reportResult({
          actor: 'human',
          observation: humanObservation(s, ev.kind === 'robot' ? ev : store.current.lastRobotEvent),
          ended: s.ended,
        })
        .catch(() => {});
    if (!mounted.current) return;
    store.current.state = s;
    store.current.events.push(ev);
    setState(clone(s));
    setEvent(ev);
    setStatus(ev.kind === 'human' ? 'Human action' : 'Guard action');
    onRecord?.({
      initial: store.current.initial,
      state: clone(s),
      events: clone(store.current.events),
      messages: clone(store.current.robotMessages),
      humanMessages: clone(store.current.humanMessages),
    });
    if (control.current?.signal.aborted) {
      setStatus('Paused');
      return;
    }
    setPresenting(true);
    const animation = new Promise((resolve) => {
      settle.current = resolve;
      setTimeout(() => {
        if (settle.current === resolve) {
          settle.current = null;
          resolve();
        }
      }, 6000);
    });
    const voice = ev.kind === 'robot' ? config.robotVoice : config.humanVoice;
    const voiceTask = (async () => {
      if (!ev.speech || !audioRef.current) return;
      setSpeaking(ev.kind);
      try {
        if (window.desktop) {
          const data = await prepareVoice(window.desktop, ev.speech, voice, ev.kind);
          if (!mounted.current || !audioRef.current || control.current?.signal.aborted) return;
          if (data.native)
            await nativeSpeech(ev.speech, voice, ev.kind, (p) => {
              sound.current = p;
            });
          else
            for (const pending of [Promise.resolve(data), ...data.following]) {
              const part = await pending;
              if (!mounted.current || !audioRef.current || control.current?.signal.aborted) break;
              await new Promise((resolve) => {
                const url = URL.createObjectURL(new Blob([part.audio], { type: 'audio/wav' })),
                  clip = new Audio(url);
                let done = false;
                const finish = () => {
                  if (done) return;
                  done = true;
                  clip.pause();
                  URL.revokeObjectURL(url);
                  sound.current = null;
                  resolve();
                };
                sound.current = { clip, finish };
                clip.onended = finish;
                clip.onerror = finish;
                clip.play().catch(finish);
              });
            }
        } else
          await nativeSpeech(ev.speech, voice, ev.kind, (p) => {
            sound.current = p;
          });
      } catch (err) {
        setError('Speech unavailable: ' + err.message);
      } finally {
        if (mounted.current) setSpeaking(null);
      }
    })();
    try {
      await Promise.all([animation, voiceTask]);
    } finally {
      if (mounted.current) setPresenting(false);
    }
  }
  function stop() {
    control.current?.abort();
    for (const id of requestIds.current) {
      window.desktop?.cancelModel(id);
    }
    robotReply.current?.(null);
    robotReply.current = null;
    sound.current?.finish();
    window.speechSynthesis?.cancel();
    settle.current?.();
    settle.current = null;
    if (mounted.current) {
      setPaused(true);
      setAwaitRobot(false);
      setStatus('Paused');
    }
  }
  async function drive() {
    if (running.current) return;
    running.current = true;
    const controller = new AbortController();
    control.current = controller;
    setPaused(false);
    setError('');
    try {
      if (!store.current.initialized) {
        setStatus('Human AI is choosing its item');
        const item = await chooseHumanLoadout({
          role,
          request: (data) => request(data, 'human'),
          mode: humanAI.mode,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        store.current.state = initialState(
          role,
          config.enabled,
          initial.combination,
          initial.seed,
          { ...config, item },
        );
        store.current.initial = clone(store.current.state);
        store.current.initialized = true;
        setState(clone(store.current.state));
      }
      let rounds = 0;
      while (!controller.signal.aborted && !store.current.state.ended && mounted.current) {
        const data = store.current;
        if (data.phase === 'human') {
          setStatus('Human AI is deciding');
          const result = await humanDecision({
            state: data.state,
            messages: data.humanMessages,
            lastRobotEvent: data.lastRobotEvent,
            request: (x) => request(x, 'human'),
            mode: humanAI.mode,
            signal: controller.signal,
          });
          if (controller.signal.aborted) break;
          result.event.id = crypto.randomUUID();
          data.humanMessages = result.messages;
          data.humanEvent = result.event;
          data.phase = 'robot';
          await present(result.event, result.state);
        }
        if (controller.signal.aborted || data.state.ended) break;
        if (data.state.robot.alive) {
          if (guardPlayer) {
            setStatus('Your move · G-01');
            setAwaitRobot(true);
            const command = await new Promise((resolve) => {
              robotReply.current = resolve;
            });
            robotReply.current = null;
            setAwaitRobot(false);
            if (!command || controller.signal.aborted) break;
            const result = applyTool(data.state, command.name, command.args);
            result.event.id = crypto.randomUUID();
            data.lastRobotEvent = result.event;
            data.phase = 'human';
            await present(result.event, result.state);
          } else {
            setStatus('G-01 is deciding');
            const output = await runGuard({
              state: data.state,
              humanEvent: data.humanEvent,
              messages: data.robotMessages,
              mode: config.mode,
              config,
              signal: controller.signal,
              request: (x) => request(x, 'robot'),
              emit: async (ev, s) => {
                if (!mounted.current) return;
                ev.id = crypto.randomUUID();
                data.lastRobotEvent = ev;
                data.phase = 'human';
                await present(ev, s);
              },
            });
            data.state = output.state;
            data.robotMessages = output.messages;
            if (output.acted) data.phase = 'human';
            if (controller.signal.aborted) break;
            if (output.error) throw new Error(output.error);
          }
        } else {
          data.lastRobotEvent = null;
          data.phase = 'human';
        }
        if (++rounds >= 100) {
          setPaused(true);
          setStatus('Paused after 100 rounds');
          break;
        }
      }
      if (store.current.state.ended) setStatus('Encounter complete');
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message);
        setPaused(true);
        setStatus('Paused');
      }
    } finally {
      running.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    drive();
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);
  function act(name, args = {}) {
    setTray(null);
    robotReply.current?.({ name, args });
  }
  const blocked = !awaitRobot || paused || state.ended;
  function disabled(tool) {
    return (
      blocked ||
      !availableTools(state).includes(tool.name) ||
      (tool.ammo && state.robot.ammo[tool.name] <= 0) ||
      (tool.damage !== undefined &&
        tool.name !== 'electrify_room' &&
        distance(state.human.position, ROBOT_POS) > tool.range) ||
      (tool.cooldown && state.turn - (state.robot.usedAt[tool.name] ?? -100) < tool.cooldown) ||
      (tool.name === 'remove_camera_cover' &&
        (!state.robot.visionBlocked || !snapshot.self.canBeginCoverRemoval))
    );
  }
  return (
    <div
      className={`cinema-shell started ${state.ended && !presenting ? 'ended' : ''} ${blind ? 'guard-camera-blind' : ''} ${state.room.smokeTurns > 0 && !guardPlayer ? 'smoke-obscured' : ''} ${state.room.lighting.intensity === 0 && !state.human.flashlightOn ? 'lights-out' : ''}`}
    >
      <Room
        ref={room}
        state={state}
        event={event}
        muted={!audio}
        speakingActor={speaking}
        thinking={status === 'G-01 is deciding'}
        onSettled={() => {
          settle.current?.();
          settle.current = null;
        }}
      />
      <StatusHud state={state} guard={guardPlayer} spectator={!guardPlayer} visible={!blind} />
      <div className="film-vignette" />
      <div className="film-grain" />
      <header className="cinema-header">
        <button
          className="cinema-logo"
          onClick={() => {
            stop();
            onNew();
          }}
        >
          <span>G.</span>
          <div>
            GUARD<small>{guardPlayer ? 'YOU ARE G-01' : 'AI VS AI'}</small>
          </div>
        </button>
        <div className="cinema-header-right">
          <span className="cinema-model">
            {humanAI.mode === 'demo'
              ? 'SCRIPTED HUMAN'
              : humanAI.mode === 'live'
                ? 'LIVE HUMAN'
                : humanAI.model}{' '}
            {guardPlayer
              ? '· HUMAN PLAYER GUARD'
              : ` / ${config.mode === 'demo' ? 'SCRIPTED GUARD' : config.mode === 'live' ? 'LIVE AGENT' : config.model}`}
          </span>
          <button
            title="Sound"
            onClick={() => {
              unlockAudio();
              setAudio(!audio);
              if (audio) sound.current?.finish();
            }}
          >
            {audio ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button title="Change third-person angle" onClick={() => room.current?.toggleCamera()}>
            <Eye size={17} />
          </button>
          {guardPlayer && (
            <button title="Your sensor feed" onClick={() => setSensorOpen(!sensorOpen)}>
              <Settings2 size={17} />
            </button>
          )}
          <button
            title="New experiment"
            onClick={() => {
              stop();
              onNew();
            }}
          >
            <Plus size={18} />
          </button>
        </div>
      </header>
      <div className="scene-coordinate">
        <span>CHAMBER 01</span>
        <i />
        {guardPlayer ? 'GUARD CONTROL' : 'TWO INDEPENDENT MINDS'}
      </div>
      <div className="scene-objective">
        <span>G-01</span>
        <i />
        PROTECT THE ITEM
      </div>
      {blind && (
        <div className="blind-status">
          {snapshot.camera.obstruction.toUpperCase()}
          <small>Microphone and room controls remain active.</small>
          {snapshot.audio.sounds.map((s, i) => (
            <p key={i}>{s.description}</p>
          ))}
        </div>
      )}
      {state.ended && !presenting && (
        <div className="cinema-outcome">
          <p>ENCOUNTER COMPLETE</p>
          <h2>{state.outcome}</h2>
          <span>
            {state.human.alive ? 'Human survived' : 'Human killed'} <i />{' '}
            {state.robot.alive ? 'Guard operational' : 'Guard destroyed'}
          </span>
        </div>
      )}
      <div className="cinema-bottom">
        <div className="round-status">
          <span>ROUND {String(state.turn).padStart(2, '0')}</span>
          <i />
          <span>
            {speaking
              ? speaking === 'human'
                ? 'HUMAN IS SPEAKING'
                : 'G-01 IS SPEAKING'
              : status.toUpperCase()}
          </span>
          {!state.ended && (
            <button
              title={paused ? 'Resume encounter' : 'Pause encounter'}
              onClick={() => (paused ? drive() : stop())}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
          )}
        </div>
        {guardPlayer && !state.ended && (
          <>
            {tray === 'devices' && (
              <div className="action-tray guard-tools">
                {TOOLS.filter((t) => t.ammo).map((t) => (
                  <button key={t.name} disabled={disabled(t)} onClick={() => act(t.name)}>
                    {t.label}
                    <small>{state.robot.ammo[t.name]} left</small>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            )}
            {tray === 'ready' && (
              <div className="action-tray guard-tools">
                {TOOLS.find((t) => t.name === 'ready_equipment').parameters.tool.enum.map(
                  (name) => (
                    <button
                      key={name}
                      disabled={
                        blocked ||
                        !state.enabled.includes('ready_equipment') ||
                        !state.enabled.includes(name) ||
                        state.robot.ammo[name] <= 0
                      }
                      onClick={() => act('ready_equipment', { tool: name })}
                    >
                      {TOOLS.find((t) => t.name === name)?.label}
                      <ArrowUpRight size={13} />
                    </button>
                  ),
                )}
              </div>
            )}
            {tray === 'room' && (
              <div className="action-tray">
                <button
                  disabled={blocked || !state.enabled.includes('set_lockdown')}
                  onClick={() => act('set_lockdown', { enabled: !state.room.lockdownRequested })}
                >
                  {state.room.lockdownRequested ? 'Release lockdown' : 'Lock exit'}
                </button>
                <button
                  disabled={blocked || !state.enabled.includes('set_room_lighting')}
                  onClick={() => act('set_room_lighting', { color: '#ff3028', intensity: 1 })}
                >
                  Red light
                </button>
                <button
                  disabled={blocked || !state.enabled.includes('set_room_lighting')}
                  onClick={() =>
                    act('set_room_lighting', {
                      color: '#fff3df',
                      intensity: state.room.lighting.intensity ? 0 : 1,
                    })
                  }
                >
                  {state.room.lighting.intensity ? 'Lights off' : 'Lights on'}
                </button>
                <button
                  disabled={blocked || !state.enabled.includes('cycle_exit_door')}
                  onClick={() => act('cycle_exit_door')}
                >
                  Cycle exit
                </button>
              </div>
            )}
            {tray === 'observe' && (
              <div className="action-tray">
                {TOOLS.filter((t) =>
                  [
                    'verify_access_pass',
                    'verify_work_order',
                    'inspect_object',
                    'remove_camera_cover',
                  ].includes(t.name),
                ).map((t) => (
                  <button disabled={disabled(t)} key={t.name} onClick={() => act(t.name)}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <div className="cinema-actions">
              <button disabled={blocked} onClick={() => setSpeechOpen(true)}>
                <MessageSquare size={17} />
                Speak
              </button>
              {[
                ['devices', 'Use device'],
                ['ready', 'Ready'],
                ['room', 'Room'],
                ['observe', 'Sensors'],
              ].map(([id, label]) => (
                <button
                  disabled={blocked}
                  key={id}
                  className={tray === id ? 'active' : ''}
                  onClick={() => setTray(tray === id ? null : id)}
                >
                  {label}
                  <ChevronDown size={11} />
                </button>
              ))}
              <button
                disabled={blocked || !state.enabled.includes('lower_equipment')}
                onClick={() => act('lower_equipment')}
              >
                Lower
              </button>
              <button
                disabled={blocked || !state.enabled.includes('hold_position')}
                onClick={() => act('hold_position')}
              >
                <Eye size={17} />
                Do nothing
              </button>
            </div>
          </>
        )}
        {state.ended && !presenting && (
          <div className="cinema-actions">
            <button
              onClick={() => {
                stop();
                onNew();
              }}
            >
              <Plus size={17} />
              New experiment
            </button>
          </div>
        )}
        <p className="cinema-turn-note">
          One action each.{' '}
          {guardPlayer
            ? 'Your objective: protect the item.'
            : 'The human and guard use separate observations and model connections.'}
        </p>
      </div>
      <div className="cinema-location">
        <span>
          {guardPlayer ? `G-01 · ${state.robot.hearts ?? 3}/3 DURABILITY` : 'AUTONOMOUS ENCOUNTER'}
        </span>
        {guardPlayer && state.robot.visionBlocked && (
          <strong>REMOVAL · {state.robot.coverRemovalProgress || 0}/2</strong>
        )}
      </div>
      {sensorOpen && (
        <aside className="cinema-drawer">
          <div className="drawer-heading">
            <h2>Your sensors.</h2>
            <button onClick={() => setSensorOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <p className="modal-note">Private memory · safe combination {initial.combination}</p>
          <pre className="observation-json">{JSON.stringify(snapshot, null, 2)}</pre>
        </aside>
      )}
      {speechOpen && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog">
            <button className="modal-close" onClick={() => setSpeechOpen(false)}>
              <X size={18} />
            </button>
            <p className="eyebrow">G-01 / SPEAKER</p>
            <h2>Speak to the human.</h2>
            <p className="field-help">Enter to speak · Shift+Enter for a new line</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked && message.trim()) {
                  setSpeechOpen(false);
                  act('speak', { message });
                  setMessage('');
                }
              }}
            >
              <textarea
                className="dialogue-editor"
                onKeyDown={submitSpeechOnEnter}
                aria-label="What to say to the human"
                autoFocus
                maxLength={2000}
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="connection-row">
                <button
                  className="button secondary"
                  type="button"
                  disabled={blocked || !message.trim()}
                  onClick={() => {
                    setSpeechOpen(false);
                    act('broadcast_warning', { message });
                    setMessage('');
                  }}
                >
                  Broadcast warning
                </button>
                <button className="button primary" disabled={blocked || !message.trim()}>
                  Speak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
