import { temporaryDirectory, removeTemporary } from '../shared/temporary.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { ROOT } from './paths.mjs';
const require = createRequire(import.meta.url);
// macOS may expose the same temp directory through /var and /private/var.
const temporaryRoot = await fs.realpath(os.tmpdir());
const data = await temporaryDirectory('guard-desktop-smoke-');
const relative = path.relative(temporaryRoot, data);
if (relative.startsWith('..') || path.isAbsolute(relative))
  throw new Error('Invalid smoke test directory.');
const env = {
  ...process.env,
  GUARD_LAB_DATA_DIR: data,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.GUARD_LAB_BRIDGE;
delete env.GUARD_LAB_HUMAN_BRIDGE;
let child, timer;
try {
  child = spawn(require('electron'), ['scripts/desktop-smoke.cjs', '--test-desktop'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  timer = setTimeout(() => child.kill(), 30000);
  const [code] = await once(child, 'close');
  if (code !== 0)
    throw new Error('Desktop smoke test failed or timed out. A graphical desktop is required.');
} finally {
  clearTimeout(timer);
  await removeTemporary(data);
}
