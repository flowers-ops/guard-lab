import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { ROOT } from './paths.mjs';
import { chooseVoiceRoot, hasInstalledVoices } from '../shared/voice-install.mjs';
const require = createRequire(import.meta.url);
const major = Number(process.versions.node.split('.')[0]);
const checks = [{ name: 'Node.js 22 or newer', ok: major >= 22 }];
for (const name of ['vite', 'electron']) {
  try {
    require.resolve(name);
    checks.push({ name: `${name} installed`, ok: true });
  } catch {
    checks.push({ name: `${name} installed (run npm ci)`, ok: false });
  }
}
try {
  const binary = require('electron');
  await fs.access(binary);
  checks.push({ name: 'Electron binary downloaded', ok: true });
  if (process.platform === 'linux') {
    const result = spawnSync('ldd', [binary], { encoding: 'utf8', windowsHide: true });
    if (!result.error) {
      const missing = (result.stdout || '')
        .split('\n')
        .filter((line) => line.includes('not found'))
        .map((line) => line.trim().split(' ')[0]);
      checks.push({
        name: 'Electron system libraries',
        ok: missing.length === 0,
        ...(missing.length ? { missing } : {}),
      });
    }
  }
} catch {
  checks.push({
    name: 'Electron binary downloaded (run npm ci without --ignore-scripts)',
    ok: false,
  });
}
const display =
  process.platform !== 'linux' || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
checks.push({ name: 'Desktop display (needed for 3D app, not tests/bridge)', ok: display });
const voiceRoot = await chooseVoiceRoot({ development: path.join(ROOT, '.voice-runtime') });
const installedVoices = await hasInstalledVoices(voiceRoot);
console.log(
  JSON.stringify(
    {
      ok: checks.every((c) => c.ok),
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      checks,
      speech: installedVoices
        ? 'English Piper voices ready'
        : 'Missing English Piper voices install automatically on first launch',
    },
    null,
    2,
  ),
);
if (checks.some((c) => !c.ok)) process.exitCode = 1;
