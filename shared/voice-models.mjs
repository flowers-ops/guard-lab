// Local speech models: Kokoro-82M (text to speech) and Whisper base.en (speech to text).
// Used by the Electron voice worker and by `npm run voices:install`. Model files live in
// dataDirectory()/models; nothing is fetched outside installModel().
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import runtime from './runtime.cjs';
import { kokoroStyle, resolveVoice } from './voice-catalog.mjs';
import {
  STT_SAMPLE_RATE,
  encodeWav,
  resample,
  isSilent,
  cleanTranscript,
  speakableText,
  sentenceChunks,
  joinAudio,
  sizeLabel,
} from './voice-audio.mjs';

export * from './voice-audio.mjs';
export const MARKER_VERSION = 1;
export const KINDS = Object.freeze(['tts', 'stt']);

const file = (name, size, sha256) => Object.freeze({ path: name, size, sha256 });
// Revisions are pinned to upstream commits; sizes and SHA-256 digests verify every byte.
export const MODELS = Object.freeze({
  tts: Object.freeze({
    kind: 'tts',
    label: 'Kokoro-82M',
    title: 'Kokoro voices',
    repo: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
    dtype: 'q8',
    files: Object.freeze([
      file('config.json', 44, 'df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f'),
      file(
        'tokenizer.json',
        3497,
        '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34',
      ),
      file(
        'tokenizer_config.json',
        113,
        'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20',
      ),
      file(
        'onnx/model_quantized.onnx',
        92361116,
        'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478',
      ),
    ]),
  }),
  stt: Object.freeze({
    kind: 'stt',
    label: 'Whisper base.en',
    title: 'Whisper speech-to-text',
    repo: 'onnx-community/whisper-base.en',
    revision: '51eefc0af78b103839eda9e7e4f4186acc6517fe',
    dtype: Object.freeze({ encoder_model: 'fp32', decoder_model_merged: 'q8' }),
    files: Object.freeze([
      file('config.json', 2197, 'c8a0de5ed8a083565a4319db29d0c210fda35b4d6076c2d711cae53ae00f3cb1'),
      file(
        'generation_config.json',
        1556,
        '3479b1f44a07e41db799e22599222fee5816738036def94a39841cb9cdbb4120',
      ),
      file(
        'preprocessor_config.json',
        339,
        'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d',
      ),
      file(
        'tokenizer.json',
        2405679,
        '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0',
      ),
      file(
        'tokenizer_config.json',
        282662,
        '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c',
      ),
      file(
        'onnx/encoder_model.onnx',
        82468078,
        '1cc86302d480b061452d348638064383ab41b6f3333ddd0e423532d14edaf535',
      ),
      file(
        'onnx/decoder_model_merged_quantized.onnx',
        53692803,
        'dd4761a3f7add26afda3512abff4706920404c2517e85a9f2ff090b0c0987909',
      ),
    ]),
  }),
});

export const modelsDirectory = (root = runtime.dataDirectory()) => path.join(root, 'models');
export const totalBytes = (spec) => spec.files.reduce((sum, f) => sum + f.size, 0);
const modelRoot = (dir, spec) => path.join(dir, ...spec.repo.split('/'));
const markerPath = (dir, spec) => path.join(dir, spec.kind + '.json');
const specFor = (kind, spec) => {
  if (spec) return spec;
  if (!KINDS.includes(kind)) throw new Error('Unknown voice component: ' + kind);
  return MODELS[kind];
};
const sameDtype = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function component(spec, state, message, extra = {}) {
  const total = totalBytes(spec);
  return {
    state,
    progress: state === 'ready' ? 1 : 0,
    bytes: state === 'ready' ? total : 0,
    totalBytes: total,
    sizeLabel: sizeLabel(total),
    model: spec.label,
    message,
    ...extra,
  };
}

/** Cheap status check: marker matches this spec and every file has the expected size. */
export async function readStatus(kind, { dir = modelsDirectory(), spec } = {}) {
  spec = specFor(kind, spec);
  const marker = await fs
    .readFile(markerPath(dir, spec), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (!marker) return component(spec, 'missing', 'Not installed');
  if (
    marker.version !== MARKER_VERSION ||
    marker.repo !== spec.repo ||
    marker.revision !== spec.revision ||
    !sameDtype(marker.dtype, spec.dtype)
  )
    return component(spec, 'missing', 'A newer model is available. Install to update.');
  for (const entry of spec.files) {
    const stat = await fs.stat(path.join(modelRoot(dir, spec), entry.path)).catch(() => null);
    if (!stat?.isFile() || stat.size !== entry.size)
      return component(spec, 'error', 'Model files are damaged. Install again to repair.');
  }
  return component(spec, 'ready', 'Ready');
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function intact(file, entry) {
  const stat = await fs.stat(file).catch(() => null);
  return Boolean(
    stat?.isFile() && stat.size === entry.size && (await sha256File(file)) === entry.sha256,
  );
}

async function acquireLock(lock, onWait) {
  const token = randomUUID(),
    deadline = Date.now() + 30 * 60 * 1000;
  await fs.mkdir(path.dirname(lock), { recursive: true, mode: 0o700 });
  while (true) {
    try {
      const handle = await fs.open(lock, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
      await handle.close();
      return token;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const owner = await fs
      .readFile(lock, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    let stale = false;
    if (owner?.pid) {
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        stale = error.code === 'ESRCH';
      }
    } else {
      const stat = await fs.stat(lock).catch(() => null);
      stale = !stat || Date.now() - stat.mtimeMs > 30000;
    }
    if (stale) {
      await fs.rm(lock, { force: true });
      continue;
    }
    if (Date.now() > deadline)
      throw new Error('Another model installation is still running. Retry when it finishes.');
    onWait?.();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function releaseLock(lock, token) {
  const owner = await fs
    .readFile(lock, 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (owner?.token === token) await fs.rm(lock, { force: true });
}

function friendly(error, name) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError')
    return new Error(`Download of ${name} stalled. Check your connection and retry.`);
  if (error instanceof TypeError && /fetch/i.test(error.message))
    return new Error('Could not reach huggingface.co. Check your connection and retry.');
  // Electron's net.fetch (used by the app so system proxies and certificates apply).
  const network = /\bnet::ERR_[A-Z_]+/.exec(error?.message || '');
  if (network)
    return new Error(
      `Could not reach huggingface.co (${network[0]}). Check your connection and retry.`,
    );
  return error;
}

async function* download(url, { fetchImpl, signal, idleMs, name }) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  let timer;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(new DOMException('Download stalled', 'TimeoutError')),
      idleMs,
    );
  };
  try {
    arm();
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`Model download failed (HTTP ${response.status}): ${name}`);
    for await (const chunk of response.body) {
      arm();
      yield chunk;
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function fetchFile(target, entry, { url, source, fetchImpl, signal, idleMs, onBytes }) {
  const name = path.basename(entry.path),
    part = `${target}.${randomUUID()}.part`;
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const handle = await fs.open(part, 'wx');
  const hash = createHash('sha256');
  let received = 0;
  try {
    const chunks = source
      ? createReadStream(source, { highWaterMark: 1 << 20 })
      : download(url, { fetchImpl, signal, idleMs, name });
    for await (const chunk of chunks) {
      if (signal?.aborted) throw signal.reason || new Error('Installation cancelled.');
      received += chunk.length;
      if (received > entry.size) throw new Error(`Unexpected size for ${name}. Retry the install.`);
      hash.update(chunk);
      await handle.write(chunk);
      onBytes(received);
    }
    await handle.close();
    if (received !== entry.size)
      throw new Error(`Incomplete download: ${name}. Retry the install.`);
    if (hash.digest('hex') !== entry.sha256)
      throw new Error(`Checksum mismatch for ${name}. Retry the install.`);
    await fs.rename(part, target);
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(part, { force: true });
    throw friendly(error, name);
  }
}

/** Delete partial downloads and marker temporaries left by an interrupted install. */
async function removeLeftovers(root, marker) {
  const names = await fs.readdir(root, { recursive: true }).catch(() => []);
  const stale = names.filter((name) => name.endsWith('.part')).map((name) => path.join(root, name));
  const prefix = path.basename(marker) + '.';
  for (const name of await fs.readdir(path.dirname(marker)).catch(() => []))
    if (name.startsWith(prefix) && name.endsWith('.tmp'))
      stale.push(path.join(path.dirname(marker), name));
  await Promise.all(stale.map((file) => fs.rm(file, { force: true }).catch(() => {})));
}

async function ensureSpace(dir, needed) {
  if (!needed || typeof fs.statfs !== 'function') return;
  const stats = await fs.statfs(dir).catch(() => null);
  if (stats && stats.bavail * stats.bsize < needed * 1.1 + 50e6)
    throw new Error(`Not enough disk space: ${sizeLabel(needed)} is needed for the model.`);
}

const installs = new Map();
/**
 * Download (or copy from `source`, a directory laid out like the models directory), verify,
 * load-check and mark a component ready. Resolves to { status, model } where `model` is the
 * loaded instance returned by `check` (kept warm by the worker).
 */
export function installModel(kind, options = {}) {
  const spec = specFor(kind, options.spec),
    dir = path.resolve(options.dir || modelsDirectory()),
    key = dir + '|' + spec.kind;
  if (installs.has(key)) return installs.get(key);
  const pending = lockedInstall(spec, { ...options, dir }).finally(() => installs.delete(key));
  installs.set(key, pending);
  return pending;
}

async function lockedInstall(spec, options) {
  const { dir, onProgress = () => {} } = options;
  const lock = path.join(dir, `.${spec.kind}.install.lock`);
  const token = await acquireLock(lock, () =>
    onProgress({ phase: 'waiting', progress: 0, message: 'Waiting for another install' }),
  );
  try {
    return await install(spec, options);
  } finally {
    await releaseLock(lock, token);
  }
}

async function install(
  spec,
  {
    dir,
    onProgress = () => {},
    fetchImpl = fetch,
    source,
    signal,
    check = defaultCheck,
    endpoint = process.env.HF_ENDPOINT || 'https://huggingface.co',
    idleMs = 60000,
  },
) {
  const total = totalBytes(spec),
    root = modelRoot(dir, spec);
  const report = (phase, bytes, message, extra) =>
    onProgress({
      kind: spec.kind,
      phase,
      bytes,
      totalBytes: total,
      // Downloads fill 0..0.96; verification and the load check take the rest.
      progress: phase === 'ready' ? 1 : Math.min(0.96, (bytes / total) * 0.96),
      message,
      ...extra,
    });
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Not ready again until every file is verified and the model loads.
  await fs.rm(markerPath(dir, spec), { force: true });
  // The install lock is held, so any partial file here belongs to an interrupted install.
  await removeLeftovers(root, markerPath(dir, spec));
  report('checking', 0, 'Checking files');
  let done = 0;
  const todo = [];
  for (const entry of spec.files) {
    if (await intact(path.join(root, entry.path), entry)) done += entry.size;
    else todo.push(entry);
  }
  await ensureSpace(
    dir,
    todo.reduce((sum, entry) => sum + entry.size, 0),
  );
  report('downloading', done, todo.length ? 'Downloading ' + spec.label : 'Files verified');
  for (const entry of todo) {
    let last = 0;
    await fetchFile(path.join(root, entry.path), entry, {
      url: `${endpoint.replace(/\/$/, '')}/${spec.repo}/resolve/${spec.revision}/${entry.path}`,
      source: source && path.join(path.resolve(source), ...spec.repo.split('/'), entry.path),
      fetchImpl,
      signal,
      idleMs,
      onBytes: (received) => {
        // Throttle to ~1% steps of the whole component.
        if (received === entry.size || received - last > total / 100) {
          last = received;
          report('downloading', done + received, 'Downloading ' + spec.label, {
            file: entry.path,
          });
        }
      },
    });
    done += entry.size;
  }
  onProgress({
    kind: spec.kind,
    phase: 'loading',
    bytes: total,
    totalBytes: total,
    progress: 0.98,
    message: 'Testing ' + spec.label,
  });
  const model = await check(spec, { dir });
  const marker = {
    version: MARKER_VERSION,
    kind: spec.kind,
    repo: spec.repo,
    revision: spec.revision,
    dtype: spec.dtype,
    files: Object.fromEntries(spec.files.map((entry) => [entry.path, entry.size])),
    installedAt: new Date().toISOString(),
  };
  const temporary = markerPath(dir, spec) + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(marker, null, 2));
  await fs.rename(temporary, markerPath(dir, spec));
  report('ready', total, 'Ready');
  return { status: await readStatus(spec.kind, { dir, spec }), model };
}

/** Remove a component's files. The caller must unload the model first. */
export async function removeModel(kind, { dir = modelsDirectory(), spec } = {}) {
  spec = specFor(kind, spec);
  await fs.rm(markerPath(dir, spec), { force: true });
  await fs.rm(modelRoot(dir, spec), { recursive: true, force: true, maxRetries: 4 });
  await fs.rmdir(path.dirname(modelRoot(dir, spec))).catch(() => {});
  return readStatus(kind, { dir, spec });
}

/**
 * Readable error for a speech runtime that fails to load. On Windows onnxruntime needs the
 * Microsoft Visual C++ runtime; packages bundle it, but a source checkout relies on the system.
 */
export function runtimeFailure(error, { platform = process.platform, arch = process.arch } = {}) {
  const detail = String(error?.message || error || 'unknown error').split('\n')[0];
  if (
    platform === 'win32' &&
    (error?.code === 'ERR_DLOPEN_FAILED' || /specified module could not be found/i.test(detail))
  ) {
    const target = arch === 'arm64' ? 'arm64' : arch === 'ia32' ? 'x86' : 'x64';
    return Object.assign(
      new Error(
        `Local speech needs the Microsoft Visual C++ Redistributable. Install https://aka.ms/vs/17/release/vc_redist.${target}.exe and restart Guard Lab.`,
      ),
      { code: 'VC_RUNTIME_MISSING' },
    );
  }
  // Otherwise usually a missing native binary (onnxruntime-node or sharp) for this OS/architecture.
  return new Error(
    `The local speech runtime could not start (${detail}). Reinstall Guard Lab or run npm ci.`,
  );
}

let transformersModule;
async function transformers(dir) {
  transformersModule ||= import('@huggingface/transformers').catch((error) => {
    transformersModule = null;
    throw runtimeFailure(error);
  });
  const library = await transformersModule;
  // Offline only: models resolve from dir/<org>/<repo>/... and are never fetched at load time.
  library.env.allowRemoteModels = false;
  library.env.allowLocalModels = true;
  // transformers joins with "/" (Windows accepts forward slashes in file paths).
  library.env.localModelPath = dir.split(path.sep).join('/').replace(/\/?$/, '/');
  library.env.useFSCache = false;
  library.env.useBrowserCache = false;
  library.env.cacheDir = dir;
  return library;
}

export async function loadModel(kind, { dir = modelsDirectory() } = {}) {
  const spec = specFor(kind);
  const library = await transformers(dir);
  if (kind === 'tts') {
    const { KokoroTTS } = await import('kokoro-js');
    return KokoroTTS.from_pretrained(spec.repo, { dtype: spec.dtype, device: 'cpu' });
  }
  return library.pipeline('automatic-speech-recognition', spec.repo, {
    dtype: { ...spec.dtype },
    device: 'cpu',
  });
}

export async function unloadModel(model) {
  try {
    await (model?.model?.dispose?.() ?? model?.dispose?.());
  } catch {}
}

/** Load the freshly installed model and run one short inference. */
export async function defaultCheck(spec, { dir }) {
  let model;
  try {
    model = await loadModel(spec.kind, { dir });
  } catch (error) {
    if (error.code === 'VC_RUNTIME_MISSING') throw error;
    throw new Error(`${spec.label} could not load: ${error.message}`);
  }
  try {
    if (spec.kind === 'tts') {
      const audio = await model.generate('Ready.', { voice: 'bm_george' });
      if (!audio?.audio?.length) throw new Error('Kokoro produced no audio.');
    } else await model(new Float32Array(STT_SAMPLE_RATE));
    return model;
  } catch (error) {
    await unloadModel(model);
    throw new Error(`${spec.label} could not run on this computer: ${error.message}`);
  }
}

const cancelled = () => Object.assign(new Error('Speech cancelled.'), { code: 'CANCELLED' });
// Kokoro pass size: sentences merged up to this length. Shorter passes let a cancelled line
// stop sooner (the signal is checked between passes); the limit of one pass is ~500 phonemes.
export const KOKORO_CHUNK = 100;

/**
 * Kokoro text → { wav: Uint8Array, sampleRate, durationMs, voice }. An aborted `signal` stops
 * the job before the next pass.
 */
export async function synthesizeSpeech(
  tts,
  { text, voice, actor = 'robot', speed = 1 },
  { signal } = {},
) {
  const id = resolveVoice(voice, actor),
    style = kokoroStyle(id),
    rate = Math.min(1.6, Math.max(0.6, Number(speed) || 1));
  const chunks = sentenceChunks(speakableText(text), KOKORO_CHUNK);
  if (!chunks.length) throw new Error('Nothing to say.');
  let sampleRate = 24000;
  const parts = [];
  for (const [index, chunk] of chunks.entries()) {
    // Let a pending abort message arrive: an inference pass blocks the worker's event loop.
    if (signal && index) await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) throw cancelled();
    const result = await tts.generate(chunk, { voice: style, speed: rate });
    sampleRate = result.sampling_rate || sampleRate;
    parts.push(result.audio);
  }
  const samples = joinAudio(parts, sampleRate);
  return {
    wav: encodeWav(samples, sampleRate),
    sampleRate,
    durationMs: Math.round((samples.length / sampleRate) * 1000),
    voice: id,
  };
}

/** Whisper: mono float samples at any rate → { text, ms }. */
export async function transcribeSpeech(asr, { pcm, sampleRate }) {
  const started = performance.now();
  let audio = pcm instanceof Float32Array ? pcm : Float32Array.from(pcm || []);
  if (sampleRate !== STT_SAMPLE_RATE) audio = resample(audio, sampleRate, STT_SAMPLE_RATE);
  if (isSilent(audio)) return { text: '', ms: Math.round(performance.now() - started) };
  const result = await asr(
    audio,
    audio.length > 30 * STT_SAMPLE_RATE ? { chunk_length_s: 30, stride_length_s: 5 } : {},
  );
  return {
    text: cleanTranscript(
      Array.isArray(result) ? result.map((r) => r.text).join(' ') : result?.text,
    ),
    ms: Math.round(performance.now() - started),
  };
}

/** Keeps loaded models warm and runs one inference per model at a time. */
export class VoiceEngine {
  constructor({ dir = modelsDirectory(), fetchImpl, source } = {}) {
    this.dir = dir;
    this.fetchImpl = fetchImpl;
    this.source = source;
    this.models = {};
    this.loading = {};
    this.queues = { tts: Promise.resolve(), stt: Promise.resolve() };
  }
  serial(kind, task) {
    const run = this.queues[kind].then(task, task);
    this.queues[kind] = run.catch(() => {});
    return run;
  }
  async status() {
    return {
      tts: await readStatus('tts', { dir: this.dir }),
      stt: await readStatus('stt', { dir: this.dir }),
    };
  }
  async load(kind) {
    if (this.models[kind]) return this.models[kind];
    if (!this.loading[kind]) {
      this.loading[kind] = (async () => {
        const status = await readStatus(kind, { dir: this.dir });
        if (status.state !== 'ready')
          throw Object.assign(
            new Error(
              kind === 'tts' ? 'Kokoro is not installed.' : 'Speech-to-text is not installed.',
            ),
            { code: 'NOT_INSTALLED' },
          );
        return (this.models[kind] = await loadModel(kind, { dir: this.dir }));
      })().finally(() => delete this.loading[kind]);
    }
    return this.loading[kind];
  }
  async unload(kind) {
    const model = this.models[kind] || (await this.loading[kind]?.catch(() => null));
    delete this.models[kind];
    await unloadModel(model);
  }
  async install(kind, { onProgress, signal } = {}) {
    const result = await installModel(kind, {
      dir: this.dir,
      onProgress,
      signal,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      ...(this.source ? { source: this.source } : {}),
      check: (spec, options) =>
        this.serial(kind, async () => {
          await this.unload(kind);
          return defaultCheck(spec, options);
        }),
    });
    if (result.model) this.models[kind] = result.model;
    return result.status;
  }
  remove(kind) {
    return this.serial(kind, async () => {
      await this.unload(kind);
      return removeModel(kind, { dir: this.dir });
    });
  }
  warm(kind) {
    return this.serial(kind, () => this.load(kind)).then(() => true);
  }
  synthesize(args, { signal } = {}) {
    return this.serial('tts', async () => {
      if (signal?.aborted) throw cancelled();
      return synthesizeSpeech(await this.load('tts'), args, { signal });
    });
  }
  transcribe(args) {
    return this.serial('stt', async () => transcribeSpeech(await this.load('stt'), args));
  }
  async dispose() {
    await Promise.all(KINDS.map((kind) => this.unload(kind)));
  }
}
