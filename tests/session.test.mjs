import { temporaryDirectory, removeTemporary } from '../shared/temporary.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import readline from 'node:readline';
import { requestTurn, reportResult, waitForTurn, resetChannel } from '../shared/bridge.mjs';
import { ROOT } from '../scripts/paths.mjs';
const data = (id) => ({
  id,
  messages: [
    { role: 'system', content: 'Fixture guard.' },
    { role: 'user', content: '{"observation":{"turn":1}}' },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'hold_position',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
    },
  ],
});

for (const compact of [false, true])
  test(`persistent ${compact ? 'compact' : 'full'} agent session validates IDs, sends successive turns and stops on encounter end`, async () => {
    const directory = await temporaryDirectory('guard-session-');
    let child;
    try {
      child = spawn(
        process.execPath,
        ['scripts/robot-link.mjs', 'session', ...(compact ? ['--compact'] : [])],
        {
          cwd: ROOT,
          env: { ...process.env, GUARD_LAB_BRIDGE: directory },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      const closed = once(child, 'close'),
        lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
      for (const id of ['turn-1', 'turn-2']) {
        const pending = requestTurn(directory, data(id), { timeoutMs: 3000 });
        const packet = JSON.parse((await lines.next()).value);
        assert.equal(packet.id, id);
        if (compact && id === 'turn-2') {
          assert.equal(packet.instructions, undefined);
          assert.deepEqual(packet.availableTools, ['hold_position']);
        }
        if (id === 'turn-1') {
          child.stdin.write(
            JSON.stringify({ id: 'stale', action: 'hold_position', args: {} }) + '\n',
          );
          const error = JSON.parse((await lines.next()).value);
          assert.match(error.error, /Turn ID mismatch/);
          assert.equal(error.id, id);
        }
        child.stdin.write('\n');
        child.stdin.write(JSON.stringify({ id, action: 'hold_position', args: {} }) + '\n');
        assert.equal(JSON.parse((await lines.next()).value).status, 'sent');
        assert.equal((await pending).message.tool_calls[0].function.name, 'hold_position');
      }
      await reportResult(directory, { ended: true, observation: { turn: 2 } });
      assert.equal(JSON.parse((await lines.next()).value).status, 'ended');
      assert.equal((await closed)[0], 0);
    } finally {
      child?.kill();
      await removeTemporary(directory);
    }
  });
test('abort wakes a waiting observer without inventing a next turn', async () => {
  const directory = await temporaryDirectory('guard-wait-');
  try {
    const controller = new AbortController();
    const pending = waitForTurn(directory, { timeoutMs: 25000, signal: controller.signal });
    controller.abort();
    assert.equal((await pending).status, 'cancelled');
  } finally {
    await removeTemporary(directory);
  }
});
test('closing stdin stops an idle persistent agent promptly', async () => {
  const directory = await temporaryDirectory('guard-session-eof-');
  const child = spawn(process.execPath, ['scripts/robot-link.mjs', 'session'], {
    cwd: ROOT,
    env: { ...process.env, GUARD_LAB_BRIDGE: directory },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const finished = once(child, 'close');
  const timer = setTimeout(() => child.kill(), 3000);
  try {
    child.stdin.end();
    assert.equal((await finished)[0], 0);
  } finally {
    clearTimeout(timer);
    child.kill();
    await removeTemporary(directory);
  }
});
test('a new encounter clears old completion without inventing a pending action', async () => {
  const directory = await temporaryDirectory('guard-reset-');
  try {
    await reportResult(directory, { ended: true, observation: { self: { alive: false } } });
    assert.equal((await waitForTurn(directory, { timeoutMs: 0 })).status, 'ended');
    await resetChannel(directory);
    assert.equal((await waitForTurn(directory, { timeoutMs: 0 })).status, 'awaiting_next_turn');
  } finally {
    await removeTemporary(directory);
  }
});
