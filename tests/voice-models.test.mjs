import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  MODELS,
  MARKER_VERSION,
  VoiceEngine,
  installModel,
  readStatus,
  removeModel,
  runtimeFailure,
  totalBytes,
} from '../shared/voice-models.mjs';
import { temporaryDirectory, removeTemporary } from '../shared/temporary.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const REVISION = 'a'.repeat(40);
const CONTENT = {
  'config.json': Buffer.from('{"fixture":true}'),
  'onnx/model_quantized.onnx': Buffer.alloc(300000, 7),
};
const SPEC = {
  kind: 'tts',
  label: 'Fixture TTS',
  title: 'Fixture voices',
  repo: 'fixture-org/fixture-model',
  revision: REVISION,
  dtype: 'q8',
  files: Object.entries(CONTENT).map(([name, bytes]) => ({
    path: name,
    size: bytes.length,
    sha256: sha(bytes),
  })),
};

// No test may touch the network.
test.before(() => {
  globalThis.fetch = () => {
    throw new Error('Network access in tests.');
  };
});

function server(content = CONTENT) {
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    const name = url.split(`/resolve/${REVISION}/`)[1];
    if (!content[name]) return new Response('', { status: 404 });
    const bytes = content[name];
    // Several chunks so progress is aggregated across reads.
    const stream = new ReadableStream({
      start(controller) {
        for (let at = 0; at < bytes.length; at += 65536)
          controller.enqueue(new Uint8Array(bytes.subarray(at, at + 65536)));
        controller.close();
      },
    });
    return new Response(stream);
  };
  return { fetched, fetchImpl };
}

async function partFiles(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { recursive: true }))
    if (/\.(part|tmp)$/.test(entry)) found.push(entry);
  return found;
}

async function withDir(prefix, run) {
  const dir = await temporaryDirectory(prefix);
  try {
    await run(dir);
  } finally {
    await removeTemporary(dir);
  }
}

test('pinned model specs carry exact sizes, digests and commit revisions', () => {
  for (const spec of Object.values(MODELS)) {
    assert.match(spec.revision, /^[0-9a-f]{40}$/);
    for (const entry of spec.files) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.ok(entry.size > 0);
      assert.ok(!entry.path.includes('..'));
    }
  }
  assert.equal(MODELS.tts.repo, 'onnx-community/Kokoro-82M-v1.0-ONNX');
  assert.equal(MODELS.tts.dtype, 'q8');
  assert.deepEqual({ ...MODELS.stt.dtype }, { encoder_model: 'fp32', decoder_model_merged: 'q8' });
  assert.equal(Math.round(totalBytes(MODELS.tts) / 1e6), 92);
  assert.equal(Math.round(totalBytes(MODELS.stt) / 1e6), 139);
});

test('missing models report missing with size label and never start a download', async () => {
  await withDir('guard-voice-missing-', async (dir) => {
    const tts = await readStatus('tts', { dir });
    assert.equal(tts.state, 'missing');
    assert.equal(tts.progress, 0);
    assert.equal(tts.sizeLabel, '92 MB');
    assert.equal(tts.model, 'Kokoro-82M');
    assert.equal((await readStatus('stt', { dir })).sizeLabel, '139 MB');
    const engine = new VoiceEngine({ dir });
    await assert.rejects(engine.synthesize({ text: 'Hello' }), (error) => {
      assert.equal(error.code, 'NOT_INSTALLED');
      return true;
    });
    await assert.rejects(readStatus('nope', { dir }), /Unknown voice component/);
  });
});

test('install verifies every byte, runs the load check, then marks ready', async () => {
  await withDir('guard-voice-install-', async (dir) => {
    const { fetched, fetchImpl } = server();
    const progress = [];
    let checked = false;
    const result = await installModel('tts', {
      dir,
      spec: SPEC,
      fetchImpl,
      endpoint: 'https://models.invalid',
      onProgress: (event) => progress.push(event),
      check: async (spec, options) => {
        // The marker is written only after this check succeeds.
        assert.equal((await readStatus('tts', { dir, spec })).state, 'missing');
        assert.equal(options.dir, dir);
        checked = true;
        return { fixtureModel: true };
      },
    });
    assert.equal(checked, true);
    assert.deepEqual(result.model, { fixtureModel: true });
    assert.equal(result.status.state, 'ready');
    assert.equal(result.status.progress, 1);
    assert.deepEqual(
      fetched.sort(),
      SPEC.files
        .map((f) => `https://models.invalid/${SPEC.repo}/resolve/${REVISION}/${f.path}`)
        .sort(),
    );
    for (let i = 1; i < progress.length; i++)
      assert.ok(progress[i].progress >= progress[i - 1].progress, 'progress never goes back');
    assert.ok(
      progress.some((p) => p.phase === 'downloading' && p.progress > 0 && p.progress < 0.96),
    );
    assert.equal(progress.at(-1).phase, 'ready');
    assert.equal(progress.at(-1).bytes, totalBytes(SPEC));
    assert.equal(progress.at(-1).totalBytes, totalBytes(SPEC));
    const marker = JSON.parse(await fs.readFile(path.join(dir, 'tts.json'), 'utf8'));
    assert.equal(marker.version, MARKER_VERSION);
    assert.equal(marker.repo, SPEC.repo);
    assert.equal(marker.revision, REVISION);
    assert.deepEqual(await partFiles(dir), []);
    assert.deepEqual(
      await fs.readFile(path.join(dir, 'fixture-org/fixture-model/onnx/model_quantized.onnx')),
      CONTENT['onnx/model_quantized.onnx'],
    );
  });
});

test('a failed load check leaves the model not ready and keeps verified files for retry', async () => {
  await withDir('guard-voice-check-', async (dir) => {
    const { fetched, fetchImpl } = server();
    await assert.rejects(
      installModel('tts', {
        dir,
        spec: SPEC,
        fetchImpl,
        check: async () => {
          throw new Error('Fixture model failed to load');
        },
      }),
      /failed to load/,
    );
    assert.equal((await readStatus('tts', { dir, spec: SPEC })).state, 'missing');
    const count = fetched.length;
    await installModel('tts', { dir, spec: SPEC, fetchImpl, check: async () => null });
    assert.equal(fetched.length, count, 'verified files are not downloaded again');
    assert.equal((await readStatus('tts', { dir, spec: SPEC })).state, 'ready');
  });
});

test('checksum and HTTP failures reject without partial files or a ready marker', async () => {
  await withDir('guard-voice-bad-', async (dir) => {
    const tampered = { ...CONTENT, 'onnx/model_quantized.onnx': Buffer.alloc(300000, 8) };
    await assert.rejects(
      installModel('tts', {
        dir,
        spec: SPEC,
        fetchImpl: server(tampered).fetchImpl,
        check: async () => null,
      }),
      /Checksum mismatch/,
    );
    assert.deepEqual(await partFiles(dir), []);
    assert.equal((await readStatus('tts', { dir, spec: SPEC })).state, 'missing');
    const missing = { 'config.json': CONTENT['config.json'] };
    await assert.rejects(
      installModel('tts', {
        dir,
        spec: SPEC,
        fetchImpl: server(missing).fetchImpl,
        check: async () => null,
      }),
      /HTTP 404/,
    );
    assert.deepEqual(await partFiles(dir), []);
  });
});

test('damaged files report an error and reinstall repairs only the damaged file', async () => {
  await withDir('guard-voice-repair-', async (dir) => {
    const { fetched, fetchImpl } = server();
    await installModel('tts', { dir, spec: SPEC, fetchImpl, check: async () => null });
    await fs.writeFile(path.join(dir, 'fixture-org/fixture-model/onnx/model_quantized.onnx'), 'x');
    const damaged = await readStatus('tts', { dir, spec: SPEC });
    assert.equal(damaged.state, 'error');
    assert.match(damaged.message, /damaged/);
    const before = fetched.length;
    await installModel('tts', { dir, spec: SPEC, fetchImpl, check: async () => null });
    assert.equal(fetched.length, before + 1);
    assert.ok(fetched.at(-1).endsWith('onnx/model_quantized.onnx'));
    assert.equal((await readStatus('tts', { dir, spec: SPEC })).state, 'ready');
  });
});

test('markers from another revision or format are not treated as ready', async () => {
  await withDir('guard-voice-marker-', async (dir) => {
    const { fetchImpl } = server();
    await installModel('tts', { dir, spec: SPEC, fetchImpl, check: async () => null });
    const file = path.join(dir, 'tts.json');
    const marker = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const changed of [
      { ...marker, revision: 'b'.repeat(40) },
      { ...marker, version: MARKER_VERSION + 1 },
      { ...marker, dtype: 'fp32' },
    ]) {
      await fs.writeFile(file, JSON.stringify(changed));
      assert.equal((await readStatus('tts', { dir, spec: SPEC })).state, 'missing');
    }
    await fs.writeFile(file, '{ damaged');
    assert.equal((await readStatus('tts', { dir, spec: SPEC })).state, 'missing');
  });
});

test('concurrent installs share one download and a crashed installer lock is recovered', async () => {
  await withDir('guard-voice-lock-', async (dir) => {
    await fs.writeFile(
      path.join(dir, '.tts.install.lock'),
      JSON.stringify({ pid: 999999999, token: 'crashed-fixture' }),
    );
    const { fetched, fetchImpl } = server();
    const options = { dir, spec: SPEC, fetchImpl, check: async () => null };
    const first = installModel('tts', options);
    assert.equal(installModel('tts', options), first);
    await first;
    assert.equal(fetched.length, SPEC.files.length);
    await assert.rejects(fs.access(path.join(dir, '.tts.install.lock')));
  });
});

test('a local source folder installs offline with the same verification', async () => {
  await withDir('guard-voice-source-', async (root) => {
    const source = path.join(root, 'mirror'),
      dir = path.join(root, 'models');
    for (const [name, bytes] of Object.entries(CONTENT)) {
      const file = path.join(source, SPEC.repo, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
    }
    const fetchImpl = () => {
      throw new Error('should not fetch');
    };
    const { status } = await installModel('tts', {
      dir,
      spec: SPEC,
      source,
      fetchImpl,
      check: async () => null,
    });
    assert.equal(status.state, 'ready');
    const removed = await removeModel('tts', { dir, spec: SPEC });
    assert.equal(removed.state, 'missing');
    await assert.rejects(fs.access(path.join(dir, SPEC.repo)));
    await assert.rejects(fs.access(path.join(dir, 'tts.json')));
  });
});

test('a stalled download is aborted with a readable message', async () => {
  await withDir('guard-voice-stall-', async (dir) => {
    const fetchImpl = async (url, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener('abort', () => controller.error(signal.reason));
          },
        }),
      );
    await assert.rejects(
      installModel('tts', { dir, spec: SPEC, fetchImpl, idleMs: 50, check: async () => null }),
      /stalled/,
    );
    assert.deepEqual(await partFiles(dir), []);
  });
});

test('partial files left by an interrupted install are removed by the next install', async () => {
  await withDir('guard-voice-leftover-', async (dir) => {
    const root = path.join(dir, SPEC.repo);
    await fs.mkdir(path.join(root, 'onnx'), { recursive: true });
    // What a killed installer leaves behind: a random-name partial download and marker temp.
    await fs.writeFile(path.join(root, 'onnx/model_quantized.onnx.0f3c-crashed.part'), 'partial');
    await fs.writeFile(path.join(root, 'config.json.1a2b.part'), 'partial');
    await fs.writeFile(path.join(dir, 'tts.json.5e6f.tmp'), '{}');
    await fs.writeFile(path.join(dir, 'stt.json.7a8b.tmp'), '{}');
    const { fetchImpl } = server();
    await installModel('tts', { dir, spec: SPEC, fetchImpl, check: async () => null });
    assert.deepEqual(await partFiles(root), []);
    assert.equal((await readStatus('tts', { dir, spec: SPEC })).state, 'ready');
    // Another component's temporaries are not this install's to delete.
    await fs.access(path.join(dir, 'stt.json.7a8b.tmp'));
  });
});

test('a speech runtime that cannot load explains the Windows Visual C++ fix', () => {
  const dlopen = Object.assign(
    new Error('The specified module could not be found.\r\n\\\\?\\C:\\x\\onnxruntime_binding.node'),
    { code: 'ERR_DLOPEN_FAILED' },
  );
  const windows = runtimeFailure(dlopen, { platform: 'win32', arch: 'x64' });
  assert.equal(windows.code, 'VC_RUNTIME_MISSING');
  assert.match(windows.message, /Visual C\+\+ Redistributable/);
  assert.match(windows.message, /vc_redist\.x64\.exe/);
  assert.match(runtimeFailure(dlopen, { platform: 'win32', arch: 'arm64' }).message, /arm64\.exe/);
  const mac = runtimeFailure(new Error('dlopen failed\nstack'), { platform: 'darwin' });
  assert.match(mac.message, /could not start \(dlopen failed\)\. Reinstall/);
});
