export function drawChance(state) {
  let x = state.rngState >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x >>> 0;
  state.randomIndex++;
  return state.rngState / 4294967296;
}
export function normalizeSeed(seed) {
  return Number(seed) >>> 0 || 0x6d2b79f5;
}
