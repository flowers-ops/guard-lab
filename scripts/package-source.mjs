import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { ROOT } from './paths.mjs';
import { sourceFiles } from './source-files.mjs';
import { audit } from './audit.mjs';

const report = await audit();
if (!report.ok) throw new Error('Source privacy audit failed. Run npm run audit:source.');
const files = await sourceFiles(ROOT),
  entries = [],
  manifest = {};
for (const name of files) {
  const data = await fs.readFile(path.join(ROOT, name));
  entries.push({ name: 'guard-lab/' + name, data });
  manifest[name] = createHash('sha256').update(data).digest('hex');
}
entries.push({
  name: 'guard-lab/SOURCE-MANIFEST.json',
  data: Buffer.from(JSON.stringify({ format: 1, files: manifest }, null, 2) + '\n'),
});
// Deterministic ZIP: normalized date (2000-01-01), permissions, no user/host/time extra fields.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const b of buffer) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
for (const { name, data } of entries) {
  const filename = Buffer.from(name),
    packed = deflateRawSync(data, { level: 9 }),
    crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0x2821, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(filename.length, 26);
  local.push(header, filename, packed);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(0x314, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(8, 10);
  record.writeUInt16LE(0x2821, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(packed.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(filename.length, 28);
  record.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  record.writeUInt32LE(offset, 42);
  central.push(record, filename);
  offset += header.length + filename.length + packed.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, directory, end]),
  out = path.join(ROOT, 'release-source');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'Guard-Lab-source.zip'), zip);
await fs.writeFile(
  path.join(out, 'Guard-Lab-source.sha256'),
  createHash('sha256').update(zip).digest('hex') + '  Guard-Lab-source.zip\n',
);
console.log(
  `Source release ready: release-source/Guard-Lab-source.zip (${entries.length} files, ${zip.length} bytes).`,
);
