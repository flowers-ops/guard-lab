import test from 'node:test';
import { grenadeLanding } from '../src/sim/spatial.mjs';
import { ZONES, ROBOT_POS } from '../src/sim/engine.mjs';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  projectileMotion,
  capsuleContact,
  surfaceContact,
  safeReach,
} from '../src/scene/physics.mjs';
test('grenade lobs land near the authoritative blast point without passing through a human or ceiling', () => {
  for (const zone of ['entrance', 'center', 'safe', 'robot', 'exit']) {
    const human = ZONES[zone],
      target = grenadeLanding(human, ROBOT_POS);
    const motion = projectileMotion(new Vector3(1.35, 1.7, -2), target, {
      kind: 'grenade',
      humanCenter: human,
    });
    assert.ok(!motion.collisions.some((c) => c.kind === 'human'), zone);
    assert.ok(
      motion.samples.every((p) => p.y >= 0.13 && p.y + 0.13 < 3.52),
      zone,
    );
    assert.ok(Math.hypot(motion.final.x - target[0], motion.final.z - target[1]) < 0.15, zone);
  }
});

test('thrown balls strike the body surface, rebound, and settle above the floor', () => {
  for (const kind of ['foam', 'hard'])
    for (const center of [
      [0.5, -1.4],
      [0, 0.8],
      [-1.8, 2.6],
    ]) {
      const origin = new Vector3(1.25, 1.23, -1.72),
        motion = projectileMotion(origin, center, { kind });
      const impact = motion.collisions.find((c) => c.kind === 'human');
      assert.ok(impact, `${kind} should hit ${center}`);
      const index = Math.ceil(impact.time / motion.step),
        before = motion.samples[Math.max(0, index - 2)],
        after = motion.samples[index + 5],
        contact = new Vector3(...impact.position);
      const normal = capsuleContact(contact, center, 0.28, 0.35, 1.28, 0.13).normal;
      assert.ok(after.clone().sub(contact).dot(normal) > 0, `${kind} must rebound`);
      assert.ok(before.distanceTo(contact) > 0);
      for (const sample of motion.samples) {
        assert.ok(sample.y >= 0.13 - 1e-8);
        assert.ok(
          !capsuleContact(sample, center, 0.28, 0.35, 1.28, 0.13).inside,
          `${kind} may not penetrate`,
        );
        assert.ok(Math.abs(sample.x) <= 3.02 - 0.13 + 1e-8);
        assert.ok(Math.abs(sample.z) <= 3.47 - 0.13 + 1e-8);
      }
      assert.ok(motion.collisions.some((c) => c.kind === 'floor'));
      assert.deepEqual(
        motion.samples.map((v) => v.toArray()),
        projectileMotion(origin, center, { kind }).samples.map((v) => v.toArray()),
      );
    }
});
test('glove and gun contacts stop outside the body and weapon reach respects clearance', () => {
  const center = [0.5, -1.4],
    origin = new Vector3(1.3, 1.16, -2);
  for (const radius of [0.04, 0.19])
    assert.equal(
      capsuleContact(surfaceContact(origin, center, radius), center, 0.28, 0.35, 1.28, radius)
        .inside,
      false,
    );
  const shoulder = new Vector3(1.4, 1.16, -2),
    aim = new Vector3(0.5, 1.1, -1.4),
    length = 0.42;
  const grip = shoulder
    .clone()
    .addScaledVector(aim.clone().sub(shoulder).normalize(), safeReach(shoulder, aim, length));
  assert.ok(aim.distanceTo(grip) >= length + 0.33 + 0.06 - 1e-8);
});
