import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { temporaryDirectory, removeTemporary } from '../shared/temporary.mjs';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.cjs');
const ORT = 'node_modules/onnxruntime-node/bin/napi-v3';

// Minimal PE image: "MZ", e_lfanew at 0x3c, then "PE\0\0" and the machine type.
function peFile(machine, body = '') {
  const bytes = Buffer.alloc(0x100 + body.length);
  bytes.write('MZ', 0, 'latin1');
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write('PE\0\0', 0x80, 'latin1');
  bytes.writeUInt16LE(machine, 0x84);
  bytes.write(body, 0x100, 'latin1');
  return bytes;
}

async function packaged(root) {
  const appOutDir = path.join(root, 'win-unpacked'),
    unpacked = path.join(appOutDir, 'resources', 'app.asar.unpacked'),
    ort = path.join(unpacked, ORT, 'win32', 'x64'),
    sharp = path.join(unpacked, 'node_modules', '@img', 'sharp-win32-x64', 'lib');
  await fs.mkdir(ort, { recursive: true });
  await fs.mkdir(sharp, { recursive: true });
  const imports =
    'MSVCP140.dll\0MSVCP140_1.dll\0VCRUNTIME140.dll\0VCRUNTIME140_1.dll\0KERNEL32.dll';
  await fs.writeFile(path.join(ort, 'onnxruntime.dll'), peFile(0x8664, imports));
  await fs.writeFile(
    path.join(ort, 'onnxruntime_binding.node'),
    peFile(0x8664, 'MSVCP140.dll\0VCRUNTIME140.dll'),
  );
  await fs.writeFile(path.join(sharp, 'libvips-42.dll'), peFile(0x8664, 'KERNEL32.dll'));
  return { appOutDir, ort, sharp };
}

async function runtimeFolder(root, machine) {
  const folder = path.join(root, `crt-${machine.toString(16)}`);
  await fs.mkdir(folder, { recursive: true });
  for (const name of ['msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'])
    await fs.writeFile(path.join(folder, name), peFile(machine));
  return folder;
}

async function withPackage(t, run) {
  const root = await temporaryDirectory('guard-vc-runtime-');
  // Only the explicit folder is searched: hide Visual Studio and System32 on Windows hosts.
  const saved = {};
  for (const [key, value] of Object.entries({
    GUARD_LAB_VC_RUNTIME_DIR: undefined,
    VCToolsRedistDir: undefined,
    'ProgramFiles(x86)': path.join(root, 'none'),
    SystemRoot: path.join(root, 'none'),
  })) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const messages = [];
  t.mock.method(console, 'log', (...args) => messages.push(args.join(' ')));
  t.mock.method(console, 'warn', (...args) => messages.push(args.join(' ')));
  try {
    await run(root, messages);
  } finally {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await removeTemporary(root);
  }
}

test('Windows packages get the VC++ runtime next to onnxruntime, nothing else', async (t) => {
  await withPackage(t, async (root, messages) => {
    const { appOutDir, ort, sharp } = await packaged(root);
    process.env.GUARD_LAB_VC_RUNTIME_DIR = await runtimeFolder(root, 0x8664);
    await config.afterPack({ electronPlatformName: 'win32', arch: 1, appOutDir });
    const copied = (await fs.readdir(ort)).filter((name) => !/^onnxruntime/.test(name)).sort();
    assert.deepEqual(copied, [
      'msvcp140.dll',
      'msvcp140_1.dll',
      'vcruntime140.dll',
      'vcruntime140_1.dll',
    ]);
    assert.deepEqual(await fs.readdir(sharp), ['libvips-42.dll'], 'only folders that need it');
    assert.match(messages.join('\n'), /bundled Visual C\+\+ runtime/);
  });
});

test('a VC++ runtime for the wrong architecture is not bundled; other OSes are untouched', async (t) => {
  await withPackage(t, async (root, messages) => {
    const { appOutDir, ort } = await packaged(root);
    process.env.GUARD_LAB_VC_RUNTIME_DIR = await runtimeFolder(root, 0xaa64);
    await config.afterPack({ electronPlatformName: 'win32', arch: 1, appOutDir });
    assert.deepEqual((await fs.readdir(ort)).sort(), [
      'onnxruntime.dll',
      'onnxruntime_binding.node',
    ]);
    assert.match(messages.join('\n'), /Visual C\+\+ runtime for x64 not found/);
    process.env.GUARD_LAB_VC_RUNTIME_DIR = await runtimeFolder(root, 0x8664);
    await config.afterPack({ electronPlatformName: 'darwin', arch: 3, appOutDir });
    assert.equal((await fs.readdir(ort)).length, 2);
  });
});

test('each desktop package keeps only its own speech runtime binaries', () => {
  const mac = config.mac.files,
    win = config.win.files,
    linux = config.linux.files;
  for (const list of [mac, win, linux]) assert.ok(list.includes('dist/**/*'));
  assert.ok(mac.includes(`!${ORT}/win32/**`) && mac.includes(`!${ORT}/linux/**`));
  assert.ok(win.includes(`!${ORT}/darwin/**`) && win.includes(`!${ORT}/linux/**`));
  assert.ok(linux.some((pattern) => /libonnxruntime_providers_\{cuda,tensorrt\}/.test(pattern)));
  assert.match(config.mac.extendInfo.NSMicrophoneUsageDescription, /push-to-talk/);
});
