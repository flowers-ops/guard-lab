import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { installVoices, hasInstalledVoices } from '../shared/voice-install.mjs';
import { temporaryDirectory, removeTemporary } from '../shared/temporary.mjs';

function fixture(root) {
  const fetched = [];
  const options = {
    root,
    platform: 'win32',
    arch: 'x64',
    fetchImpl: async (url) => {
      fetched.push(url);
      return new Response(
        url.endsWith('.json') ? JSON.stringify({ espeak: { voice: 'en-us' } }) : 'fixture asset',
      );
    },
    extract: async (_, args) => {
      if (args[0] === '-tf') return { stdout: 'piper/\npiper/piper.exe\n' };
      await fs.mkdir(path.join(root, 'engine/piper'), { recursive: true });
      await fs.writeFile(path.join(root, 'engine/piper/piper.exe'), 'fixture engine');
      return { stdout: '' };
    },
  };
  return { options, fetched };
}

test('first launch installs all English voices once; concurrent requests and later launches reuse assets', async () => {
  const root = await temporaryDirectory('guard-auto-voices-');
  try {
    const { options, fetched } = fixture(root),
      progress = [];
    options.onProgress = (value) => progress.push(value);
    const first = installVoices(options);
    assert.equal(installVoices(options), first);
    await first;
    assert.equal(await hasInstalledVoices(root, 'win32'), true);
    assert.equal(progress.at(-1).phase, 'ready');
    assert.equal(fetched.length, 11);
    await installVoices(options);
    assert.equal(fetched.length, 11);
    assert.equal(
      (await fs.readdir(root)).some((n) => n.endsWith('.part')),
      false,
    );
  } finally {
    await removeTemporary(root);
  }
});

test('damaged cached model is downloaded again while valid voices are retained', async () => {
  const root = await temporaryDirectory('guard-repair-voices-');
  try {
    const { options, fetched } = fixture(root);
    await installVoices(options);
    await fs.writeFile(path.join(root, 'models/en_US-amy-medium.onnx'), 'damaged');
    assert.equal(await hasInstalledVoices(root, 'win32'), false);
    await installVoices(options);
    assert.equal(fetched.length, 12);
    assert.ok(fetched.at(-1).endsWith('en_US-amy-medium.onnx'));
    assert.equal(await hasInstalledVoices(root, 'win32'), true);
  } finally {
    await removeTemporary(root);
  }
});

test('failed automatic download can retry without downloading completed voices again', async () => {
  const root = await temporaryDirectory('guard-retry-voices-');
  try {
    const { options, fetched } = fixture(root),
      original = options.fetchImpl;
    options.fetchImpl = async (url) =>
      url.endsWith('en_US-amy-medium.onnx') ? new Response('', { status: 503 }) : original(url);
    await assert.rejects(installVoices(options), /503/);
    options.fetchImpl = original;
    await installVoices(options);
    assert.equal(fetched.filter((url) => url.endsWith('en_US-ryan-medium.onnx')).length, 1);
    assert.equal(await hasInstalledVoices(root, 'win32'), true);
  } finally {
    await removeTemporary(root);
  }
});

test('automatic installer rejects archive traversal before extraction', async () => {
  const root = await temporaryDirectory('guard-unsafe-voice-');
  try {
    const { options } = fixture(root);
    options.extract = async () => ({ stdout: 'piper/../../escape' });
    await assert.rejects(installVoices(options), /Unsafe speech archive/);
    assert.equal(await hasInstalledVoices(root, 'win32'), false);
  } finally {
    await removeTemporary(root);
  }
});

test('a stale crashed installer lease is recovered', async () => {
  const root = await temporaryDirectory('guard-stale-voices-');
  try {
    await fs.writeFile(
      path.join(root, '.install.lock'),
      JSON.stringify({ pid: 999999999, token: 'old-fixture' }),
    );
    await installVoices(fixture(root).options);
    assert.equal(await hasInstalledVoices(root, 'win32'), true);
    await assert.rejects(fs.access(path.join(root, '.install.lock')));
  } finally {
    await removeTemporary(root);
  }
});

test('compressed HTTP headers do not reject an already decompressed voice body', async () => {
  const root = await temporaryDirectory('guard-compressed-voices-');
  try {
    const { options } = fixture(root);
    const original = options.fetchImpl;
    options.fetchImpl = async (url) => {
      const response = await original(url);
      response.headers.set('content-encoding', 'gzip');
      response.headers.set('content-length', '1');
      return response;
    };
    await installVoices(options);
    assert.equal(await hasInstalledVoices(root, 'win32'), true);
  } finally {
    await removeTemporary(root);
  }
});
