import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import readline from 'node:readline';
import { temporaryDirectory, removeTemporary } from '../shared/temporary.mjs';
import { requestTurn, sendDecision, waitForTurn } from '../shared/bridge.mjs';
import { ROOT } from '../scripts/paths.mjs';
import { toolSchemas } from '../src/sim/tools.mjs';
import { prepareVoice, speechSegments } from '../src/audio/prepare.mjs';
import { createPacketFormatter } from '../scripts/packet-format.mjs';
import { warningRaised, segmentHitsBox, raisedEquipmentPose } from '../src/scene/physics.mjs';
import { solveArm } from '../src/scene/rig.mjs';
import { Box3, Vector3 } from 'three';

test('compact exchange returns the next packet without terminal polling and rejects a stale short ID', async () => {
  const directory = await temporaryDirectory('guard-exchange-');
  const packet = (id, turn, tools) => ({
    id,
    messages: [
      { role: 'system', content: 'Fixture safe combination is 9327.' },
      { role: 'user', content: JSON.stringify({ observation: { turn } }) },
    ],
    tools: toolSchemas(tools),
  });
  const firstId = '00000001-1111-4111-8111-111111111111';
  const nextId = '00000002-1111-4111-8111-111111111111';
  const children = [];
  const launch = (args) => {
    const child = spawn(process.execPath, ['scripts/robot-link.mjs', ...args], {
      cwd: ROOT,
      env: { ...process.env, GUARD_LAB_BRIDGE: directory },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    return child;
  };
  try {
    const first = requestTurn(directory, packet(firstId, 1, ['hold_position']), {
      timeoutMs: 5000,
    });
    await waitForTurn(directory, { timeoutMs: 1000 });
    const child = launch(['exchange', 'hold_position', '--id=00000001', '--compact']);
    const closed = once(child, 'close');
    const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    assert.equal(JSON.parse((await lines.next()).value).status, 'sent');
    assert.equal((await first).message.tool_calls[0].function.name, 'hold_position');
    const next = requestTurn(directory, packet(nextId, 2, ['hold_position', 'set_lockdown']), {
      timeoutMs: 5000,
    });
    const observed = JSON.parse((await lines.next()).value);
    assert.equal(observed.id, nextId);
    assert.equal(observed.replyId, '00000002');
    assert.equal(observed.instructions, undefined);
    assert.deepEqual(observed.toolUpdates, toolSchemas(['set_lockdown']));
    assert.ok(!JSON.stringify(observed).includes('9327'));
    assert.equal((await closed)[0], 0);
    const stale = launch(['act', 'hold_position', '--id=00000001']);
    assert.equal((await once(stale, 'close'))[0], 1);
    assert.equal((await waitForTurn(directory, { timeoutMs: 0 })).id, nextId);
    await sendDecision(directory, { action: 'hold_position', args: {} }, nextId);
    assert.equal((await next).message.tool_calls[0].function.name, 'hold_position');
  } finally {
    children.forEach((c) => c.kill());
    await removeTemporary(directory);
  }
});

test('changed instructions force a full packet instead of reusing stale context', () => {
  const format = createPacketFormatter({ compact: true });
  const base = {
    status: 'waiting',
    id: 'first',
    instructions: 'First.',
    tools: toolSchemas(['hold_position']),
    observation: { turn: 1 },
  };
  format(base);
  assert.equal(format({ ...base, id: 'next' }).instructionsUnchanged, true);
  assert.equal(format({ ...base, id: 'new', instructions: 'Changed.' }).instructions, 'Changed.');
});

test('long speech preserves the chosen words and releases its first audio before the rest', async () => {
  const text =
    'This is the complete first sentence of the selected reply. ' +
    'The remaining words must still be spoken exactly as chosen. '.repeat(6);
  const parts = speechSegments(text);
  assert.equal(parts.length, 2);
  assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
  assert.deepEqual(speechSegments('X'.repeat(400)), ['X'.repeat(400)]);
  let finish;
  const second = new Promise((resolve) => {
    finish = resolve;
  });
  const calls = [];
  const ready = await prepareVoice(
    {
      synthesize: ({ text }) => {
        calls.push(text);
        return calls.length === 1 ? Promise.resolve({ audio: [1] }) : second;
      },
    },
    text,
    'piper:lessac',
    'robot',
  );
  assert.deepEqual(ready.audio, [1]);
  assert.equal(ready.following.length, 1);
  assert.equal(calls.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
  finish({ audio: [2] });
  assert.deepEqual((await ready.following[0]).audio, [2]);
});

test('the glove warning stays stable near the human and high ready clears the vault', () => {
  let raised = false;
  for (let frame = 0; frame < 200; frame++) {
    raised = warningRaised(1.12 + Math.sin(frame) * 0.015, 0.51, raised);
    assert.equal(raised, true, 'no aiming/high-ready oscillation at the safe');
  }
  assert.equal(warningRaised(1.5, 0.51, true), true, 'clearance hysteresis');
  assert.equal(warningRaised(2, 0.51, true), false);
  const vault = new Box3(new Vector3(-0.48, 0, -3.17), new Vector3(0.98, 1.76, -1.68));
  const shoulder = new Vector3(1.4, 1.16, -2),
    target = new Vector3(-1.8, 1.1, -2.5);
  assert.equal(segmentHitsBox(shoulder, target, vault), true);
  const pose = solveArm(shoulder, raisedEquipmentPose(shoulder, target).grip);
  assert.equal(segmentHitsBox(shoulder, pose.elbow, vault, 0.08), false);
  assert.equal(segmentHitsBox(pose.elbow, pose.grip, vault, 0.08), false);
});
