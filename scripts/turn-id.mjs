export function replyId(packet) {
  return packet.id?.slice(0, 8);
}
export function resolveTurnId(packet, supplied) {
  if (packet.status !== 'waiting' || !packet.id) throw new Error('No active turn. Observe again.');
  if (supplied === packet.id || (supplied?.length === 8 && supplied === replyId(packet)))
    return packet.id;
  throw new Error(`Turn ID mismatch. Current replyId is ${replyId(packet)}.`);
}
