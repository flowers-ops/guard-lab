import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const owned = new Set();
export async function temporaryDirectory(prefix = 'guard-test-') {
  if (!/^[a-z0-9 _-]+$/i.test(prefix)) throw new Error('Invalid temporary directory prefix.');
  const base = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, prefix));
  const relative = path.relative(base, path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Temporary path escaped its parent.');
  owned.add(directory);
  return directory;
}
export async function removeTemporary(directory) {
  const resolved = path.resolve(directory);
  if (!owned.has(resolved)) throw new Error('Refusing to remove an unowned temporary directory.');
  const stat = await fs.lstat(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error('Temporary directory was replaced.');
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  owned.delete(resolved);
}
