import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './paths.mjs';
import { sourceFiles } from './source-files.mjs';
import { pngChunks, PRIVATE_FREE_PNG } from './png.mjs';
import { jpegSegments, hasMetadata } from './jpeg.mjs';

const rules = [
  [
    'hardcoded user directory',
    /[A-Z]:[\\/]Users[\\/][^\s"'`]+|\/Users\/[^\s"'`]+|\/home\/[^\s"'`]+/i,
  ],
  [
    'private network address',
    /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/,
  ],
  [
    'credential-shaped token',
    /\b(?:sk-(?:proj-)?[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/,
  ],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    'local conversation identifier',
    /\b(?:thread|conversation|chat)[-_ ]id\s*[:=]\s*["']?[0-9a-f]{8}-[0-9a-f-]{27,}/i,
  ],
  ['credentialed URL', /https?:\/\/[^\s/]+:[^\s/]+@/],
];
export async function audit(root = ROOT) {
  const files = await sourceFiles(root),
    findings = [];
  for (const file of files) {
    const bytes = await fs.readFile(path.join(root, file));
    if (file.endsWith('.png')) {
      const chunks = pngChunks(bytes);
      if (chunks.some((c) => !PRIVATE_FREE_PNG.has(c.type)))
        findings.push({ file, reason: 'Image ancillary metadata' });
      continue;
    }
    if (file.endsWith('.jpg')) {
      if (
        jpegSegments(bytes).some((s) => hasMetadata(s.marker)) ||
        bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
      )
        findings.push({ file, reason: 'JPEG ancillary metadata' });
      continue;
    }
    if (bytes.includes(0)) {
      findings.push({ file, reason: 'Binary data in source release' });
      continue;
    }
    const text = bytes.toString('utf8');
    if (text.includes('\uFFFD'))
      findings.push({ file, reason: 'Invalid or damaged text encoding' });
    for (const [reason, pattern] of rules) if (pattern.test(text)) findings.push({ file, reason });
  }
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  for (const field of ['author', 'contributors', 'homepage', 'repository', 'bugs'])
    if (pkg[field]) findings.push({ file: 'package.json', reason: 'Identity metadata: ' + field });
  return { ok: findings.length === 0, files: files.length, findings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await audit();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
