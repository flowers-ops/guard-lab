export function jpegSegments(bytes) {
  if (bytes.readUInt16BE(0) !== 0xffd8) throw new Error('Expected JPEG artwork.');
  const segments = [];
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error('Invalid JPEG marker.');
    const marker = bytes[at + 1];
    if (marker === 0xda) {
      segments.push({ marker, bytes: bytes.subarray(at) });
      return segments;
    }
    const size = bytes.readUInt16BE(at + 2),
      end = at + size + 2;
    if (end > bytes.length) throw new Error('Truncated JPEG.');
    segments.push({ marker, bytes: bytes.subarray(at, end) });
    at = end;
  }
  throw new Error('Missing JPEG image scan.');
}
export const hasMetadata = (marker) => marker === 0xfe || (marker >= 0xe1 && marker <= 0xef);
export function cleanJPEG(bytes) {
  return Buffer.concat([
    bytes.subarray(0, 2),
    ...jpegSegments(bytes)
      .filter((s) => !hasMetadata(s.marker))
      .map((s) => s.bytes),
  ]);
}
