// Presentation curves only. Game consequences remain in the turn engine.
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export const damping = (strength, frameScale) => 1 - (1 - strength) ** frameScale;
export function springExtension(t) {
  if (t < 0.26 || t >= 0.8) return 0;
  if (t < 0.43) return 1 - (1 - (t - 0.26) / 0.17) ** 3;
  if (t < 0.49) return 1;
  return 1 - smooth((t - 0.49) / 0.31);
}
export function locomotion(distance, progress, running = false) {
  const weight = smooth(progress / 0.12) * (1 - smooth((progress - 0.86) / 0.14));
  const phase = distance * Math.PI * (running ? 3.5 : 4.8);
  return {
    phase,
    weight,
    stride: weight === 0 ? 0 : Math.sin(phase) * (running ? 0.65 : 0.4) * weight,
    bob: (1 - Math.cos(phase * 2)) * (running ? 0.025 : 0.013) * weight,
    lean: (running ? 0.12 : 0.035) * weight,
  };
}
export function impactEnvelope(t, at, duration = 0.2) {
  const u = (t - at) / duration;
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) * (1 - u) ** 2;
}
