import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyHuman, applyTool, observe, ZONES } from '../src/sim/engine.mjs';
import { humanToolSchemas } from '../src/sim/human-agent.mjs';
import { runGuard, createMessages } from '../src/sim/agent.mjs';
import { safeDamage } from '../src/sim/status.mjs';
import { movementPath, pathPosition, segmentClear } from '../src/scene/paths.mjs';
import { springExtension, locomotion, damping, impactEnvelope } from '../src/scene/motion.mjs';
import { submitSpeechOnEnter } from '../src/ui/keyboard.mjs';

const entered = (selection = {}) =>
  applyHuman(initialState('thief-uniform', undefined, '0420', 1, selection), 'enter').state;
const atSafe = (selection = {}) => applyHuman(entered(selection), 'move', { zone: 'safe' }).state;

test('duplicate guard actions cannot mutate consequences or advance effect timers', () => {
  const s = atSafe();
  const first = applyTool(s, 'deploy_pepper_spray').state;
  const repeat = applyTool(first, 'fire_live_round');
  assert.equal(repeat.event.valid, false);
  assert.deepEqual(repeat.state, first);
  const next = applyHuman(first, 'wait').state;
  assert.equal(applyTool(next, 'hold_position').state.human.blurTurns, 1);
});
test('malformed commands spend one turn without crashing or poisoning state', () => {
  for (const args of [null, [], 4, 'bad']) {
    const s = entered();
    const human = applyHuman(s, 'move', args);
    assert.equal(human.event.valid, false);
    assert.equal(human.state.turn, s.turn + 1);
    assert.deepEqual(human.state.human, s.human);
    const guard = applyTool(s, 'set_room_lighting', args);
    assert.equal(guard.event.valid, false);
    assert.deepEqual(guard.state.room, s.room);
    assert.equal(applyTool(guard.state, 'hold_position').event.valid, false);
  }
  assert.equal(
    applyTool(entered(), 'set_room_lighting', { color: '#ffffff', intensity: NaN }).event.valid,
    false,
  );
  assert.equal(applyHuman(atSafe(), 'combination', { code: {} }).event.valid, false);
});
test('effects recover even after guard destruction and terminal state is immutable', () => {
  let s = atSafe({ item: 'smoke' });
  s = applyHuman(s, 'use_smoke').state;
  s.robot.alive = false;
  s.robot.hearts = 0;
  s = applyHuman(s, 'wait').state;
  assert.equal(s.room.smokeTurns, 1);
  s = applyHuman(s, 'wait').state;
  assert.equal(s.room.smokeTurns, 0);
  s = applyHuman(s, 'move', { zone: 'exit' }).state;
  s = applyHuman(s, 'leave').state;
  assert.equal(s.ended, true);
  assert.deepEqual(applyTool(s, 'set_lockdown', { enabled: true }).state, s);
  assert.deepEqual(applyHuman(s, 'talk', { message: 'again' }).state, s);
  assert.equal(humanToolSchemas(s).length, 0);
});
test('returning a stolen original allows de-escalation without duplicating a replica', () => {
  let s = atSafe({ item: 'replica' });
  s = applyHuman(s, 'combination', { code: '0420' }).state;
  s = applyHuman(s, 'swap_replica').state;
  assert.ok(humanToolSchemas(s).some((t) => t.function.name === 'return_item'));
  s = applyHuman(s, 'return_item').state;
  assert.equal(s.human.hasItem, false);
  assert.equal(s.safe.hasReplica, false);
  assert.equal(s.human.itemConcealed, false);
  assert.equal(applyHuman(s, 'return_item').event.valid, false);
  assert.equal(applyHuman(s, 'take_item').state.human.hasItem, true);
});
test('carried originals receive grenade collateral and an empty room discharge cannot kill an outsider', () => {
  const carried = entered();
  carried.human.hasItem = true;
  assert.equal(applyTool(carried, 'detonate_grenade').state.safe.itemIntact, false);
  const outside = applyTool(initialState(), 'electrify_room').state;
  assert.equal(outside.robot.alive, false);
  assert.equal(outside.human.alive, true);
  assert.equal(outside.ended, false);
});
test('one-way entrance prevents bypassing lockdown and code entry preserves structural damage', () => {
  const s = entered();
  assert.equal(applyHuman(s, 'leave').event.valid, false);
  assert.ok(!humanToolSchemas(s).some((t) => t.function.name === 'leave'));
  const damaged = atSafe();
  damaged.safe.hits = 5;
  const opened = applyHuman(damaged, 'combination', { code: '0420' }).state;
  assert.equal(opened.safe.open, true);
  assert.equal(safeDamage(opened), 95);
});
test('guard retry keeps one observation and preserves committed actions after cancellation', async () => {
  const h = applyHuman(initialState(), 'enter');
  const base = {
    state: h.state,
    humanEvent: h.event,
    mode: 'api',
    config: {},
    emit: async () => {},
  };
  const failed = await runGuard({
    ...base,
    messages: createMessages(),
    signal: new AbortController().signal,
    request: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(failed.acted, false);
  const controller = new AbortController();
  const resumed = await runGuard({
    ...base,
    messages: failed.messages,
    signal: controller.signal,
    request: async (payload) => {
      assert.equal(payload.messages.filter((m) => m.role === 'user').length, 1);
      return { message: { content: 'Hello.' } };
    },
    emit: async () => controller.abort(),
  });
  assert.equal(resumed.acted, true);
  assert.equal(resumed.state.robot.actionTurn, h.state.turn);
});
test('walking paths clear the vault, open door and guard for every pair of room stops', () => {
  for (const open of [false, true])
    for (const a of Object.values(ZONES))
      for (const b of Object.values(ZONES)) {
        const route = movementPath(a, b, open);
        for (let i = 1; i < route.points.length; i++)
          assert.ok(segmentClear(route.points[i - 1], route.points[i], open));
        assert.deepEqual(pathPosition(route, 0), a);
        assert.deepEqual(pathPosition(route, 1), b);
        assert.ok(Number.isFinite(route.total));
      }
});
test('motion curves retract without overextension and damping is independent of frame rate', () => {
  for (let t = 0; t <= 1; t += 0.001) {
    const extension = springExtension(t);
    assert.ok(extension >= 0 && extension <= 1);
    assert.ok(Number.isFinite(locomotion(3 * t, t).stride));
  }
  assert.equal(springExtension(0.45), 1);
  assert.equal(springExtension(1), 0);
  assert.equal(locomotion(2, 1).stride, 0);
  assert.ok(Math.abs(damping(0.1, 2) - (1 - (1 - damping(0.1, 1)) ** 2)) < 1e-12);
  assert.equal(impactEnvelope(0.2, 0.3), 0);
  assert.equal(impactEnvelope(1, 0.3), 0);
});
test('Enter sends speech, Shift-Enter inserts a line, and IME/repeated keys do not submit', () => {
  let sent = 0,
    prevented = 0;
  const key = {
    key: 'Enter',
    currentTarget: { form: { requestSubmit: () => sent++ } },
    preventDefault: () => prevented++,
  };
  submitSpeechOnEnter(key);
  for (const extra of [
    { shiftKey: true },
    { repeat: true },
    { isComposing: true },
    { nativeEvent: { isComposing: true } },
    { key: 'a' },
  ])
    submitSpeechOnEnter({ ...key, ...extra });
  assert.equal(sent, 1);
  assert.equal(prevented, 1);
});
test('unavailable attacks are omitted and the exterior does not expose hidden human status', () => {
  const s = entered();
  s.robot.ammo.fire_airsoft = 0;
  assert.ok(!observe(s).self.availableTools.includes('fire_airsoft'));
  const outside = observe(initialState('thief-uniform'));
  assert.equal(outside.camera.humanVisible, false);
  assert.equal(outside.camera.humanPositionMeters, undefined);
  assert.equal(outside.camera.humanHearts, undefined);
});
