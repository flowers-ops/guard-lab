import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { ROOT } from './paths.mjs';
const require = createRequire(import.meta.url);
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error(
    'Install Node.js 22 or newer from https://nodejs.org, then run this command again.',
  );
  process.exit(1);
}
const stamp = path.join(ROOT, 'node_modules', '.guard-lab-install.json');
const fingerprint = createHash('sha256')
  .update(await fs.readFile(path.join(ROOT, 'package-lock.json')))
  .update(`${process.platform}/${process.arch}/${process.versions.node.split('.')[0]}`)
  .digest('hex');
async function installed() {
  try {
    require.resolve('vite');
    await fs.access(require('electron'));
    return true;
  } catch {
    return false;
  }
}
const saved = await fs
  .readFile(stamp, 'utf8')
  .then(JSON.parse)
  .catch(() => null);
if (
  !process.argv.includes('--force') &&
  saved?.fingerprint === fingerprint &&
  (await installed())
) {
  console.log(
    'Locked dependencies are already installed. Ready: npm run live or npm start. Use --force to reinstall.',
  );
  process.exit(0);
}
console.log(
  'Installing the locked dependencies. No account, API key, or model is required for demo mode.',
);
const install = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['ci', '--no-audit', '--no-fund', '--no-progress'],
  { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true },
);
install.on('error', (e) => {
  console.error('Could not run npm:', e.message);
  process.exitCode = 1;
});
install.on('exit', async (code) => {
  if (code !== 0) {
    process.exitCode = code || 1;
    console.error(
      'Setup failed. Check network/proxy access to npm and Electron downloads, then retry. No game data was changed.',
    );
    return;
  }
  if (!(await installed())) {
    console.error(
      'Electron did not download. Remove ELECTRON_SKIP_BINARY_DOWNLOAD / ignore-scripts settings, then rerun setup with --force.',
    );
    process.exitCode = 1;
    return;
  }
  await fs.writeFile(stamp, JSON.stringify({ fingerprint }));
  console.log(
    '\nReady. npm run live launches the recommended agent bridge; npm start launches the setup screen.\nRun npm run doctor for diagnostics. Read AGENTS.md before playing as an AI.',
  );
});
