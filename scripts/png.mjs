// Remove ancillary PNG chunks without decoding or changing image pixels.
export function pngChunks(bytes) {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('Expected PNG artwork.');
  const chunks = [];
  let at = 8;
  while (at < bytes.length) {
    const size = bytes.readUInt32BE(at),
      end = at + 12 + size;
    if (end > bytes.length) throw new Error('Truncated PNG.');
    chunks.push({ type: bytes.toString('ascii', at + 4, at + 8), bytes: bytes.subarray(at, end) });
    at = end;
  }
  return chunks;
}
export const PRIVATE_FREE_PNG = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);
export function cleanPNG(bytes) {
  return Buffer.concat([
    bytes.subarray(0, 8),
    ...pngChunks(bytes)
      .filter((c) => PRIVATE_FREE_PNG.has(c.type))
      .map((c) => c.bytes),
  ]);
}
