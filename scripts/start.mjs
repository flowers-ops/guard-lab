import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT } from './paths.mjs';
const require = createRequire(import.meta.url);
let server,
  desktop,
  stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  desktop?.kill();
  await server?.close();
  process.exitCode = code;
}
try {
  const { createServer } = await import('vite');
  server = await createServer({
    root: ROOT,
    server: { host: '127.0.0.1', port: 5173, strictPort: false },
  });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = spawn(require('electron'), [ROOT, '--dev-url', url, ...process.argv.slice(2)], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    // This process owns the interactive game window, not a background helper.
    windowsHide: false,
  });
  desktop.on('error', async (e) => {
    console.error('Desktop launch failed:', e.message);
    await stop(1);
  });
  desktop.on('exit', (code) => stop(code || 0));
  console.log('Guard Lab opened. Close its window to stop the launcher.');
} catch (e) {
  console.error('Start failed:', e.message, '\nRun node scripts/setup.mjs, then npm run doctor.');
  await stop(1);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
