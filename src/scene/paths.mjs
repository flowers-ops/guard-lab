import { SAFE_POS, ROBOT_POS } from '../sim/engine.mjs';
const radius = 0.25;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearSegment = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    n = dx * dx + dz * dz,
    t = n ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / n)) : 0;
  return dist(p, [a[0] + t * dx, a[1] + t * dz]);
};
function crosses(a, b, c, d) {
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}
function obstacles(open) {
  const x = SAFE_POS[0],
    z = SAFE_POS[1];
  const box = {
    min: [x - 0.725 - radius, z - 0.56 - radius],
    max: [x + 0.725 + radius, z + 0.56 + radius],
  };
  const circles = [{ center: ROBOT_POS, r: 0.47 + radius }];
  // The open vault door swings outward into the aisle, not through walking characters.
  const door = open
    ? {
        a: [x - 0.6, z + 0.57],
        b: [x - 0.6 + 1.21 * Math.cos(1.65), z + 0.57 + 1.21 * Math.sin(1.65)],
        r: radius + 0.07,
      }
    : null;
  return { box, circles, door };
}
export function segmentClear(a, b, open = false) {
  const { box, circles, door } = obstacles(open);
  let low = 0,
    high = 1;
  for (let k = 0; k < 2; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-8) {
      if (a[k] <= box.min[k] || a[k] >= box.max[k]) {
        low = 2;
        break;
      }
    } else {
      let u = (box.min[k] - a[k]) / d,
        v = (box.max[k] - a[k]) / d;
      if (u > v) [u, v] = [v, u];
      low = Math.max(low, u);
      high = Math.min(high, v);
    }
  }
  if (low < high && high > 0 && low < 1) return false;
  if (circles.some((c) => nearSegment(c.center, a, b) < c.r - 1e-6)) return false;
  if (
    door &&
    (crosses(a, b, door.a, door.b) ||
      Math.min(
        nearSegment(a, door.a, door.b),
        nearSegment(b, door.a, door.b),
        nearSegment(door.a, a, b),
        nearSegment(door.b, a, b),
      ) <
        door.r - 1e-6)
  )
    return false;
  return true;
}
export function movementPath(from, to, open = false) {
  const { box, circles, door } = obstacles(open),
    nodes = [from.slice(), to.slice()];
  for (const x of [box.min[0] - 0.03, box.max[0] + 0.03])
    for (const z of [box.min[1] - 0.03, box.max[1] + 0.03]) nodes.push([x, z]);
  for (const c of circles)
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      nodes.push([
        c.center[0] + (c.r + 0.08) * Math.cos(a),
        c.center[1] + (c.r + 0.08) * Math.sin(a),
      ]);
    }
  if (door)
    for (const p of [door.a, door.b])
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        nodes.push([p[0] + (door.r + 0.05) * Math.cos(a), p[1] + (door.r + 0.05) * Math.sin(a)]);
      }
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    done = new Set();
  costs[0] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!done.has(i) && (next < 0 || costs[i] < costs[next])) next = i;
    if (next < 0 || !Number.isFinite(costs[next]) || next === 1) break;
    done.add(next);
    for (let j = 0; j < nodes.length; j++)
      if (!done.has(j) && segmentClear(nodes[next], nodes[j], open)) {
        const cost = costs[next] + dist(nodes[next], nodes[j]);
        if (cost < costs[j]) {
          costs[j] = cost;
          previous[j] = next;
        }
      }
  }
  if (!Number.isFinite(costs[1]))
    throw new Error('No clear presentation path between room positions.');
  const points = [];
  for (let at = 1; at !== -1; at = previous[at]) points.unshift(nodes[at]);
  const lengths = points.slice(1).map((p, i) => dist(points[i], p));
  return { points, lengths, total: lengths.reduce((a, b) => a + b, 0) };
}
export function pathPosition(path, t, out = [0, 0]) {
  if (t >= 1) {
    const end = path.points.at(-1);
    out[0] = end[0];
    out[1] = end[1];
    return out;
  }
  let distance = Math.max(0, Math.min(1, t)) * path.total;
  for (let i = 0; i < path.lengths.length; i++) {
    const length = path.lengths[i];
    if (distance <= length || i === path.lengths.length - 1) {
      const f = length ? Math.min(1, distance / length) : 0;
      out[0] = path.points[i][0] + (path.points[i + 1][0] - path.points[i][0]) * f;
      out[1] = path.points[i][1] + (path.points[i + 1][1] - path.points[i][1]) * f;
      return out;
    }
    distance -= length;
  }
  out[0] = path.points[0][0];
  out[1] = path.points[0][1];
  return out;
}
