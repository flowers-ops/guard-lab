let context,
  master,
  dry,
  wet,
  enabled = true;
const noiseCache = new Map();
function audio() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.65;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 10;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    master.connect(limiter);
    limiter.connect(context.destination);
    dry = context.createGain();
    dry.gain.value = 0.85;
    dry.connect(master);
    wet = context.createConvolver();
    const impulse = context.createBuffer(2, context.sampleRate * 0.85, context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < data.length; i++)
        data[i] =
          Math.sin(i * 78.233 + c * 24) *
          Math.sin(i * 12.9898) *
          Math.pow(1 - i / data.length, 3) *
          0.15;
    }
    wet.buffer = impulse;
    const room = context.createGain();
    room.gain.value = 0.2;
    wet.connect(room);
    room.connect(master);
  }
  if (context.state === 'suspended') context.resume();
  return context;
}
export function unlockAudio() {
  try {
    audio();
  } catch {}
}
export function setSoundEnabled(value) {
  enabled = value;
  if (master) master.gain.setTargetAtTime(value ? 0.65 : 0, context.currentTime, 0.03);
}
function noise(seconds) {
  const ctx = audio(),
    key = Math.round(seconds * 100);
  if (noiseCache.has(key)) return noiseCache.get(key);
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate),
    d = b.getChannelData(0);
  let seed = 917251;
  for (let i = 0; i < d.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    d[i] = (seed >>> 0) / 2147483648 - 1;
  }
  noiseCache.set(key, b);
  return b;
}
function layer({
  frequency = 220,
  end = frequency,
  type = 'sine',
  duration = 0.1,
  volume = 0.3,
  delay = 0,
  filter = 0,
  noiseSource = false,
  pan = 0,
}) {
  const ctx = audio(),
    start = ctx.currentTime + delay,
    node = noiseSource ? ctx.createBufferSource() : ctx.createOscillator();
  if (noiseSource) node.buffer = noise(duration + 0.03);
  else {
    node.type = type;
    node.frequency.setValueAtTime(frequency, start);
    node.frequency.exponentialRampToValueAtTime(Math.max(15, end), start + duration);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    node.connect(f);
    f.connect(gain);
  } else node.connect(gain);
  gain.connect(panner);
  panner.connect(dry);
  panner.connect(wet);
  node.start(start);
  node.stop(start + duration + 0.03);
}
export function playSound(name, { force = 1, pan = 0 } = {}) {
  if (!enabled) return;
  try {
    const n = (duration, volume, filter, delay = 0) =>
      layer({ noiseSource: true, duration, volume: volume * force, filter, delay, pan });
    const t = (frequency, end, duration, volume = 0.2, type = 'sine', delay = 0) =>
      layer({ frequency, end, duration, volume: volume * force, type, delay, pan });
    if (name === 'footstep') {
      n(0.08, 0.11, 750);
      t(100, 45, 0.09, 0.08);
    } else if (name === 'draw' || name === 'lower') {
      t(340, name === 'draw' ? 680 : 160, 0.28, 0.045, 'sawtooth');
      n(0.07, 0.13, 1800, 0.22);
    } else if (name === 'spring-wind') {
      t(180, 460, 0.19, 0.028, 'triangle');
      for (let i = 0; i < 4; i++) n(0.012, 0.04, 1800, i * 0.035);
    } else if (name === 'spring-return') {
      t(290, 85, 0.28, 0.06, 'triangle');
      t(440, 140, 0.2, 0.025, 'sine', 0.035);
      n(0.035, 0.07, 1400, 0.25);
    } else if (name === 'punch') {
      n(0.16, 0.14, 2200);
      t(240, 75, 0.18, 0.12, 'triangle');
      t(510, 170, 0.12, 0.03, 'sine');
    } else if (name === 'impact') {
      n(0.08, 0.23, 2000);
      t(105, 38, 0.13, 0.22);
    } else if (name === 'foam-bounce') {
      t(90, 36, 0.12, 0.11);
      n(0.05, 0.06, 500);
    } else if (name === 'hard-bounce') {
      n(0.055, 0.18, 3200);
      t(430, 230, 0.08, 0.07, 'triangle');
    } else if (name === 'spray') {
      n(0.95, 0.2, 6200);
      t(2000, 1400, 0.9, 0.025, 'triangle');
    } else if (name === 'airsoft') {
      n(0.05, 0.4, 9000);
      t(360, 100, 0.075, 0.23, 'triangle');
      n(0.1, 0.05, 3000, 0.07);
    } else if (name === 'gunshot') {
      n(0.027, 0.7, 16000);
      n(0.18, 0.47, 4200, 0.012);
      t(150, 35, 0.24, 0.45);
      n(0.22, 0.09, 3000, 0.12);
    } else if (name === 'taser') {
      t(170, 140, 0.65, 0.06, 'sawtooth');
      for (let i = 0; i < 9; i++) n(0.022, 0.27, 12000, i * 0.062);
      t(3800, 1800, 0.65, 0.03, 'square');
    } else if (name === 'explosion') {
      n(0.15, 0.7, 6500);
      t(75, 22, 0.95, 0.6);
      n(1.2, 0.46, 1200, 0.025);
      for (let i = 0; i < 6; i++) n(0.045, 0.1, 3200, 0.25 + i * 0.065);
    } else if (name === 'electric-room') {
      t(56, 44, 1.1, 0.3, 'sawtooth');
      t(190, 80, 1.1, 0.07, 'square');
      for (let i = 0; i < 16; i++) n(0.025, 0.32, 14000, i * 0.06);
      n(1, 0.13, 1800);
    } else if (name === 'scan') {
      t(650, 650, 0.07, 0.06, 'sine');
      t(950, 950, 0.1, 0.06, 'sine', 0.12);
    } else if (name === 'safe-hit') {
      n(0.09, 0.3, 6500);
      t(190, 80, 0.32, 0.24, 'triangle');
      t(740, 570, 0.32, 0.09, 'sine');
    } else if (name === 'safe-open') {
      n(0.09, 0.19, 1500);
      t(160, 100, 0.48, 0.11, 'sawtooth');
      n(0.35, 0.06, 900, 0.13);
    } else if (name === 'keypad') {
      t(980, 980, 0.055, 0.035);
      t(1120, 1120, 0.055, 0.035, 'sine', 0.085);
    } else if (name === 'item') {
      t(690, 690, 0.14, 0.07);
      t(1035, 1035, 0.22, 0.05, 'sine', 0.08);
    } else if (name === 'warning') {
      t(430, 430, 0.15, 0.06);
      t(330, 330, 0.15, 0.06, 'sine', 0.2);
    } else if (name === 'lights') {
      t(68, 58, 0.25, 0.05);
      n(0.03, 0.05, 4000);
    } else if (name === 'fabric') {
      n(0.42, 0.13, 1900);
      n(0.17, 0.06, 3200, 0.2);
    } else if (name === 'door-lock') {
      n(0.08, 0.24, 2400);
      t(160, 70, 0.22, 0.16, 'triangle');
      n(0.14, 0.08, 700, 0.08);
    } else if (name === 'door-break') {
      n(0.09, 0.45, 5200);
      t(170, 40, 0.5, 0.28, 'triangle');
      n(0.6, 0.18, 1700, 0.07);
      n(0.08, 0.14, 6500, 0.27);
    } else if (name === 'switch') {
      n(0.025, 0.1, 4200);
      t(820, 390, 0.05, 0.035);
    } else if (name === 'lockpick') {
      n(0.04, 0.085, 4500);
      t(1800, 1200, 0.055, 0.025, 'triangle');
    } else if (name === 'paper') {
      n(0.26, 0.1, 2600);
      n(0.16, 0.05, 1800, 0.15);
    } else if (name === 'wedge') {
      n(0.11, 0.18, 1100);
      t(110, 60, 0.12, 0.075);
    } else if (name === 'smoke') {
      n(0.07, 0.27, 5000);
      n(1.05, 0.15, 6800, 0.06);
      t(180, 55, 0.18, 0.06);
    } else if (name === 'recorder') {
      n(0.025, 0.07, 5000);
      t(710, 710, 0.09, 0.045);
    } else if (name === 'door-cycle') {
      t(140, 85, 0.6, 0.11, 'sawtooth');
      n(0.4, 0.1, 900);
      n(0.07, 0.2, 2600, 0.55);
    }
  } catch {}
}
