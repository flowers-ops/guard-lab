const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const names = ['ryan', 'amy', 'lessac'];

class LocalVoices {
  constructor(root, cache) {
    this.root = root;
    this.cache = cache;
    this.workers = new Map();
    this.pending = new Map();
    this.binary = path.join(
      root,
      'engine',
      'piper',
      process.platform === 'win32' ? 'piper.exe' : 'piper',
    );
  }
  available(name) {
    return (
      existsSync(this.binary) &&
      existsSync(path.join(this.root, 'models', `en_US-${name}-medium.onnx`))
    );
  }
  voices() {
    return names
      .filter((name) => this.available(name))
      .map((name) => ({
        id: 'piper:' + name,
        name:
          name === 'ryan'
            ? 'Ryan · English (male)'
            : name === 'amy'
              ? 'Amy · English (female)'
              : 'Lessac · G-01 (female)',
        culture: 'en-US',
        gender: name === 'ryan' ? 'Male' : 'Female',
      }));
  }
  worker(name) {
    if (this.workers.has(name)) return this.workers.get(name);
    const proc = spawn(
      this.binary,
      [
        '--model',
        path.join(this.root, 'models', `en_US-${name}-medium.onnx`),
        '--json-input',
        '--quiet',
        '--sentence_silence',
        '.1',
        '--noise_scale',
        '.35',
        '--noise_w',
        '.45',
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let buffer = '';
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const file = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const request = this.pending.get(file);
        if (!request) continue;
        clearTimeout(request.timer);
        this.pending.delete(file);
        fs.readFile(file).then(
          (bytes) => request.resolve({ audio: new Uint8Array(bytes), voice: name }),
          request.reject,
        );
      }
    });
    proc.stdin.on('error', (error) => this.fail(name, error));
    proc.on('error', (error) => this.fail(name, error));
    proc.on('exit', () => {
      this.workers.delete(name);
      this.fail(name, new Error('Local voice engine stopped.'));
    });
    proc.stderr.on('data', () => {});
    this.workers.set(name, proc);
    return proc;
  }
  fail(name, error) {
    for (const [key, request] of this.pending)
      if (request.voice === name) {
        clearTimeout(request.timer);
        request.reject(error);
        this.pending.delete(key);
      }
  }
  async synthesize({ text, voice, actor }) {
    const name =
      names.includes(voice?.slice(6)) && voice.startsWith('piper:')
        ? voice.slice(6)
        : actor === 'human'
          ? 'ryan'
          : 'lessac';
    if (voice?.startsWith('native:') || !this.available(name)) return { native: true };
    const clean = String(text).slice(0, 2000),
      key = createHash('sha256')
        .update(name + '|' + clean)
        .digest('hex');
    const file = path.join(this.cache, key + '.wav');
    await fs.mkdir(this.cache, { recursive: true, mode: 0o700 });
    try {
      return { audio: new Uint8Array(await fs.readFile(file)), voice: name };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (this.pending.has(file)) return this.pending.get(file).promise;
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const timer = setTimeout(() => {
      this.pending.delete(file);
      reject(new Error('Voice generation timed out.'));
    }, 30000);
    this.pending.set(file, { resolve, reject, timer, voice: name, promise });
    this.worker(name).stdin.write(JSON.stringify({ text: clean, output_file: file }) + '\n');
    return promise;
  }
  close() {
    for (const [name, proc] of this.workers) {
      this.fail(name, new Error('Speech cancelled.'));
      proc.kill();
    }
    this.workers.clear();
  }
}
module.exports = { LocalVoices };
