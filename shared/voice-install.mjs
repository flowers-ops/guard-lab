import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import runtime from './runtime.cjs';

const exec = promisify(execFile);
export const VOICE_NAMES = ['ryan', 'amy', 'lessac'];
const assets = {
  'win32-x64': 'piper_windows_amd64.zip',
  'win32-arm64': 'piper_windows_amd64.zip',
  'linux-x64': 'piper_linux_x86_64.tar.gz',
  'linux-arm64': 'piper_linux_aarch64.tar.gz',
  'darwin-x64': 'piper_macos_x64.tar.gz',
  'darwin-arm64': 'piper_macos_aarch64.tar.gz',
};
export const persistentVoiceRoot = () => path.join(runtime.dataDirectory(), 'voices');
async function present(file) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || !stat.size) return false;
    if (file.endsWith('.onnx.json')) {
      const config = JSON.parse(await fs.readFile(file, 'utf8'));
      return /^en[_-]US$/i.test(config.language?.code || config.espeak?.voice || '');
    }
    return true;
  } catch {
    return false;
  }
}
export async function hasInstalledVoices(root, platform = process.platform, verifyHashes = true) {
  if (
    !root ||
    !(await present(path.join(root, 'engine/piper', platform === 'win32' ? 'piper.exe' : 'piper')))
  )
    return false;
  const hashes = verifyHashes
    ? await fs
        .readFile(path.join(root, 'ASSET-HASHES.json'), 'utf8')
        .then(JSON.parse)
        .catch(() => ({}))
    : {};
  for (const name of VOICE_NAMES) {
    if (!(await present(path.join(root, 'models', `en_US-${name}-medium.onnx`)))) return false;
    try {
      const config = JSON.parse(
        await fs.readFile(path.join(root, 'models', `en_US-${name}-medium.onnx.json`), 'utf8'),
      );
      if (!/^en[_-]US$/i.test(config.language?.code || config.espeak?.voice || '')) return false;
    } catch {
      return false;
    }
    for (const suffix of ['.onnx', '.onnx.json']) {
      const relative = `models/en_US-${name}-medium${suffix}`;
      if (
        hashes[relative] &&
        createHash('sha256')
          .update(await fs.readFile(path.join(root, relative)))
          .digest('hex') !== hashes[relative]
      )
        return false;
    }
  }
  return true;
}
export async function chooseVoiceRoot({ development, bundled } = {}) {
  if (process.env.GUARD_LAB_VOICES) return path.resolve(process.env.GUARD_LAB_VOICES);
  for (const root of [bundled, development])
    if (await hasInstalledVoices(root, process.platform, false)) return root;
  return persistentVoiceRoot();
}

const installations = new Map();
export function installVoices(options = {}) {
  const root = path.resolve(options.root || persistentVoiceRoot());
  if (installations.has(root)) return installations.get(root);
  const pending = lockedInstall({ ...options, root }).finally(() => installations.delete(root));
  installations.set(root, pending);
  return pending;
}

async function lockedInstall(options) {
  const { root, platform = process.platform, onProgress = () => {} } = options;
  if (await hasInstalledVoices(root, platform)) {
    onProgress({ phase: 'ready', message: 'English voices ready' });
    return root;
  }
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const lock = path.join(root, '.install.lock'),
    token = randomUUID(),
    deadline = Date.now() + 900000;
  while (true) {
    try {
      const handle = await fs.open(lock, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
      await handle.close();
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await fs
        .readFile(lock, 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      if (owner?.pid) {
        try {
          process.kill(owner.pid, 0);
        } catch (error) {
          if (error.code === 'ESRCH') {
            await fs.rm(lock, { force: true });
            continue;
          }
        }
      } else {
        const stat = await fs.stat(lock).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > 30000) {
          await fs.rm(lock, { force: true });
          continue;
        }
      }
      if (Date.now() > deadline)
        throw new Error('Another voice installation is still running. Retry when it finishes.');
      onProgress({ phase: 'checking', message: 'Waiting for the existing English voice download' });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  try {
    return await install(options);
  } finally {
    const owner = await fs
      .readFile(lock, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    if (owner?.token === token) await fs.rm(lock, { force: true });
  }
}

async function install({
  root,
  onProgress = () => {},
  fetchImpl = fetch,
  extract = exec,
  platform = process.platform,
  arch = process.arch,
}) {
  if (await hasInstalledVoices(root, platform)) {
    onProgress({ phase: 'ready', message: 'English voices ready' });
    return root;
  }
  const asset = assets[platform + '-' + arch];
  if (!asset)
    throw new Error('No Piper engine for this platform. Install an English system voice.');
  await fs.mkdir(path.join(root, 'models'), { recursive: true, mode: 0o700 });
  const hashes = await fs
    .readFile(path.join(root, 'ASSET-HASHES.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => ({}));
  async function download(url, file) {
    if (await present(file)) {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (
        !hashes[relative] ||
        createHash('sha256')
          .update(await fs.readFile(file))
          .digest('hex') === hashes[relative]
      )
        return;
    }
    const name = path.basename(file),
      part = file + '.' + randomUUID() + '.part';
    onProgress({
      phase: 'downloading',
      message: 'Downloading ' + name,
      file: name,
      received: 0,
      total: 0,
    });
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error(`Voice download failed (${response.status}): ${name}`);
    // fetch decompresses HTTP bodies; compressed wire length is not file length.
    const encoding = response.headers.get('content-encoding');
    const total =
      !encoding || encoding === 'identity'
        ? Number(response.headers.get('content-length')) || 0
        : 0;
    const handle = await fs.open(part, 'wx'),
      hash = createHash('sha256');
    let received = 0;
    try {
      for await (const chunk of response.body) {
        hash.update(chunk);
        await handle.write(chunk);
        received += chunk.length;
        onProgress({
          phase: 'downloading',
          message: 'Downloading ' + name,
          file: name,
          received,
          total,
        });
      }
      if (!received || (total && received !== total))
        throw new Error('Incomplete voice download: ' + name);
    } catch (error) {
      await handle.close();
      await fs.rm(part, { force: true });
      throw error;
    }
    await handle.close();
    try {
      if (file.endsWith('.onnx.json')) {
        const config = JSON.parse(await fs.readFile(part, 'utf8'));
        if (!/^en[_-]US$/i.test(config.language?.code || config.espeak?.voice || ''))
          throw new Error('Downloaded voice is not US English.');
      }
      await fs.rename(part, file);
    } catch (error) {
      await fs.rm(part, { force: true });
      throw error;
    }
    hashes[path.relative(root, file).replaceAll('\\', '/')] = hash.digest('hex');
  }
  const engine = path.join(root, 'engine/piper', platform === 'win32' ? 'piper.exe' : 'piper');
  if (!(await present(engine))) {
    const archive = path.join(root, asset);
    await download(
      'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/' + asset,
      archive,
    );
    onProgress({ phase: 'extracting', message: 'Installing speech engine' });
    let listing;
    try {
      listing = (await extract('tar', ['-tf', archive], { windowsHide: true })).stdout;
    } catch {
      throw new Error('Speech installation needs tar. Install it and retry.');
    }
    for (const entry of listing.trim().split(/\r?\n/)) {
      const normal = entry.replaceAll('\\', '/');
      if (!normal.startsWith('piper/') || normal.split('/').includes('..') || normal.includes(':'))
        throw new Error('Unsafe speech archive entry.');
    }
    await fs.mkdir(path.join(root, 'engine'), { recursive: true });
    await extract('tar', ['-xf', archive, '-C', path.join(root, 'engine')], { windowsHide: true });
    if (!(await present(engine))) throw new Error('Speech engine extraction failed.');
    if (platform !== 'win32') await fs.chmod(engine, 0o755);
    await fs.rm(archive, { force: true });
  }
  // Finish one voice at a time: progress stays readable and retries keep completed assets.
  for (const name of VOICE_NAMES) {
    const base = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/${name}/medium/`;
    for (const file of [
      `en_US-${name}-medium.onnx`,
      `en_US-${name}-medium.onnx.json`,
      'MODEL_CARD',
    ])
      await download(
        base + file,
        path.join(root, 'models', file === 'MODEL_CARD' ? name + '-MODEL_CARD' : file),
      );
  }
  await download(
    'https://raw.githubusercontent.com/rhasspy/piper/v1.2.0/LICENSE.md',
    path.join(root, 'PIPER-LICENSE.md'),
  );
  if (!(await hasInstalledVoices(root, platform)))
    throw new Error('English voice assets are incomplete. Retry installation.');
  await fs.writeFile(path.join(root, 'ASSET-HASHES.json'), JSON.stringify(hashes, null, 2));
  onProgress({ phase: 'ready', message: 'English voices ready' });
  return root;
}
