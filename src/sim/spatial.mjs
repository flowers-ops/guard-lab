// Grenades land beside the human, clear of their capsule and the guard base.
// The engine and presentation share this point; collateral uses the same origin.
export function grenadeLanding(human, robot) {
  const dx = robot[0] - human[0],
    dz = robot[1] - human[1],
    length = Math.hypot(dx, dz) || 1;
  return length > 1.2
    ? [human[0] + (dx / length) * 0.6, human[1] + (dz / length) * 0.6]
    : [human[0] - (dz / length) * 0.85, human[1] + (dx / length) * 0.85];
}
