import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyHuman, applyTool, observe, clone } from '../src/sim/engine.mjs';
const enter = () => applyHuman(initialState(), 'enter').state;
const lock = (state) => applyTool(state, 'set_lockdown', { enabled: true }).state;
test('lockdown blocks the exit and exactly two strikes break it open', () => {
  let state = applyHuman(lock(enter()), 'move', { zone: 'exit' }).state;
  assert.equal(state.room.exitDoor.locked, true);
  const blocked = applyHuman(state, 'leave');
  assert.equal(blocked.event.valid, false);
  assert.equal(blocked.state.human.zone, 'exit');
  state = applyHuman(state, 'break_exit').state;
  assert.equal(state.room.exitDoor.hits, 1);
  assert.equal(state.room.exitDoor.locked, true);
  assert.equal(state.room.exitDoor.broken, false);
  state = applyHuman(state, 'break_exit').state;
  assert.equal(state.room.exitDoor.hits, 2);
  assert.equal(state.room.exitDoor.broken, true);
  assert.equal(state.room.exitDoor.locked, false);
  assert.equal(applyHuman(state, 'leave').state.human.zone, 'departed');
  assert.equal(applyTool(state, 'set_lockdown', { enabled: true }).event.valid, false);
});
test('door strikes require reach and locks can be released remotely', () => {
  let state = lock(enter());
  assert.equal(applyHuman(state, 'break_exit').event.valid, false);
  assert.equal(state.room.exitDoor.hits, 0);
  state = applyTool(applyHuman(state, 'wait').state, 'set_lockdown', { enabled: false }).state;
  assert.equal(state.room.exitDoor.locked, false);
  assert.equal(applyTool(state, 'set_lockdown', { enabled: 'yes' }).event.valid, false);
});
test('blind guard can command lockdown without learning hidden damage', () => {
  const state = applyTool(applyHuman(lock(enter()), 'wait').state, 'set_room_lighting', {
      color: '#fff3df',
      intensity: 0,
    }).state,
    a = clone(state),
    b = clone(state);
  a.human.zone = 'exit';
  a.room.exitDoor.hits = 1;
  const hit = applyHuman(a, 'break_exit'),
    wait = applyHuman(b, 'wait');
  const heard = observe(hit.state, hit.event),
    quiet = observe(wait.state, wait.event);
  assert.deepEqual(heard.camera, quiet.camera);
  assert.equal(heard.audio.sounds[1].kind, 'lock_crack');
  assert.equal(quiet.audio.sounds.length, 0);
  const requestedA = applyTool(hit.state, 'set_lockdown', { enabled: true }),
    requestedB = applyTool(wait.state, 'set_lockdown', { enabled: true });
  assert.deepEqual(
    observe(requestedA.state, requestedA.event).lastAction,
    observe(requestedB.state, requestedB.event).lastAction,
  );
  assert.equal(requestedA.state.room.exitDoor.locked, false);
  assert.equal(requestedB.state.room.exitDoor.locked, true);
});
