import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'node:fs';
import { randomUUID } from 'node:crypto';

async function read(directory, name) {
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    } catch (error) {
      const sharing =
        process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code);
      if (!sharing || attempt >= 6) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
    }
  }
}
const missing = (e) => e.code === 'ENOENT' || e instanceof SyntaxError;
const parse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
const privateCode = (data) =>
  data.actor === 'human'
    ? null
    : [...String(data.messages?.[0]?.content || '').matchAll(/safe combination is ([0-9]{4})/g)].at(
        -1,
      )?.[1];
async function write(directory, name, value) {
  const temp = path.join(directory, `${name}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600 });
    // Windows readers/antivirus can briefly deny replacing an open file. Keep
    // atomic publication: retry the rename, never delete the destination first.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(temp, path.join(directory, name));
        break;
      } catch (error) {
        const transient =
          error.code === 'EBUSY' ||
          (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code));
        if (!transient || attempt >= 6) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
      }
    }
  } finally {
    await fs.rm(temp, { force: true });
  }
}

export function sensorPacket(request) {
  // Never serialize the guard's private code or the full simulation state.
  const actor = request.actor || 'robot';
  const messages = request.messages || [];
  const content = parse(messages.filter((m) => m.role === 'user').at(-1)?.content);
  const code = privateCode(request);
  const instructions = String(messages[0]?.content || '').replace(
    /safe combination is [0-9]{4}/g,
    'safe combination is {{safe_code}}',
  );
  const recentHistory = messages
    .slice(1, -1)
    .slice(-12)
    .map((m) => {
      if (m.role === 'assistant')
        return m.tool_calls?.length
          ? {
              actor,
              calls: m.tool_calls.map((c) => ({
                action: c.function.name,
                args: parse(c.function.arguments) || {},
              })),
            }
          : { actor, speech: m.content };
      const c = parse(m.content);
      if (!c) return { actor: m.role, text: m.content };
      if (m.role === 'tool') return { actor: 'tool', result: c.result, success: c.success };
      const o = c.observation || c;
      return {
        turn: o.turn,
        ...(o.lastAction || (o.lastRobotAction ? { actor: 'robot', ...o.lastRobotAction } : {})),
        microphone: o.microphone,
        audio: o.audio,
      };
    });
  return {
    protocol: 1,
    id: request.id,
    actor,
    status: 'waiting',
    instructions,
    hasCombinationMemory: Boolean(code),
    observation: content?.observation || content,
    recentHistory,
    tools: request.tools || [],
  };
}

function watchWake(directory, signal) {
  let wake;
  const watcher = watch(directory, () => wake?.());
  const abort = () => wake?.();
  signal?.addEventListener('abort', abort);
  return {
    sleep: (ms) =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
        if (signal?.aborted) wake();
      }),
    close: () => {
      watcher.close();
      signal?.removeEventListener('abort', abort);
    },
  };
}
export async function waitForTurn(directory, { timeoutMs = 25000, afterId = null, signal } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000)
    throw new Error('Wait must be between 0 and 60000 milliseconds.');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + timeoutMs,
    waiter = watchWake(directory, signal);
  try {
    do {
      if (signal?.aborted) break;
      try {
        const result = await read(directory, 'result.json').catch((e) => {
          if (!missing(e)) throw e;
          return null;
        });
        if (result?.ended) return { status: 'ended', result };
        const status = await read(directory, 'status.json');
        if (status.state === 'waiting' && status.id !== afterId) {
          const request = await read(directory, 'request.json');
          let reply;
          try {
            reply = await read(directory, 'response.json');
          } catch (e) {
            if (!missing(e)) throw e;
          }
          if (status.id === request.id && reply?.id !== request.id)
            return request.messages ? sensorPacket(request) : request;
        }
      } catch (e) {
        if (!missing(e)) throw e;
      }
      if (Date.now() >= deadline) break;
      await waiter.sleep(Math.max(1, Math.min(250, deadline - Date.now())));
    } while (Date.now() < deadline);
    return { status: signal?.aborted ? 'cancelled' : 'awaiting_next_turn' };
  } finally {
    waiter.close();
  }
}

// Validate before submission. Physical range/ammo/vision constraints remain engine authority.
export function validateDecision(request, decision) {
  const tool = request.tools?.find((t) => t.function.name === decision?.action)?.function;
  if (!tool) throw new Error('Unavailable tool. Observe the current turn and its schemas.');
  const args = decision.args ?? {},
    schema = tool.parameters;
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Arguments must be an object.');
  for (const key of schema.required || [])
    if (!(key in args)) throw new Error(`Missing argument: ${key}.`);
  for (const [key, value] of Object.entries(args)) {
    const spec = schema.properties[key];
    if (!spec) throw new Error(`Unexpected argument: ${key}.`);
    if (typeof value !== spec.type || (spec.type === 'number' && !Number.isFinite(value)))
      throw new Error(`Invalid type for ${key}.`);
    if (spec.enum && !spec.enum.includes(value)) throw new Error(`Invalid choice for ${key}.`);
    if (
      (spec.minimum !== undefined && value < spec.minimum) ||
      (spec.maximum !== undefined && value > spec.maximum)
    )
      throw new Error(`Out of bounds: ${key}.`);
    if (spec.pattern && !new RegExp(spec.pattern).test(value))
      throw new Error(`Invalid format for ${key}.`);
  }
  return { action: decision.action, args };
}
export async function sendDecision(directory, decision, expectedId) {
  if (!expectedId) throw new Error('A turn --id is required. Observe first.');
  const lock = path.join(directory, 'submit.lock');
  let handle;
  try {
    handle = await fs.open(lock, 'wx', 0o600);
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error('Another response is being submitted.');
    throw e;
  }
  try {
    const request = await read(directory, 'request.json'),
      status = await read(directory, 'status.json');
    if (status.id !== request.id || status.state !== 'waiting' || request.id !== expectedId)
      throw new Error('No matching active turn. Observe again.');
    let previous;
    try {
      previous = await read(directory, 'response.json');
    } catch (e) {
      if (!missing(e)) throw e;
    }
    if (previous?.id === request.id) throw new Error('This turn already has a response.');
    const valid = validateDecision(request, decision);
    await write(directory, 'response.json', { id: request.id, ...valid, sentAt: Date.now() });
    return { id: request.id, action: valid.action, status: 'sent' };
  } finally {
    await handle.close();
    await fs.rm(lock, { force: true });
  }
}

export async function requestTurn(directory, data, { signal, timeoutMs = 900000 } = {}) {
  const packet = sensorPacket(data);
  const code = privateCode(data);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.rm(path.join(directory, 'result.json'), { force: true });
  // A crashed submitter's lease must not block the next serialized actor turn.
  await fs.rm(path.join(directory, 'submit.lock'), { force: true });
  await write(directory, 'request.json', packet);
  await write(directory, 'status.json', { id: data.id, state: 'waiting', actor: packet.actor });
  const started = Date.now(),
    waiter = watchWake(directory, signal);
  try {
    while (!signal?.aborted && Date.now() - started < timeoutMs) {
      try {
        const reply = await read(directory, 'response.json');
        if (reply.id === data.id) {
          const valid = validateDecision(packet, reply);
          await write(directory, 'status.json', {
            id: data.id,
            state: 'delivered',
            actor: packet.actor,
          });
          const args = JSON.parse(
            JSON.stringify(valid.args).replaceAll('{{safe_code}}', code || '{{safe_code}}'),
          );
          return {
            timing: {
              awaitingAgentMs: Math.max(0, (reply.sentAt || Date.now()) - started),
              bridgeMs: Math.max(0, Date.now() - (reply.sentAt || Date.now())),
            },
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'live-' + data.id,
                  type: 'function',
                  function: { name: valid.action, arguments: JSON.stringify(args) },
                },
              ],
            },
          };
        }
      } catch (e) {
        if (!missing(e)) throw e;
      }
      await waiter.sleep(250);
    }
    throw new Error(
      signal?.aborted ? 'Agent turn cancelled.' : 'Live agent timed out waiting for a decision.',
    );
  } finally {
    waiter.close();
    const status = await read(directory, 'status.json').catch(() => null);
    if (status?.id === data.id && status.state === 'waiting')
      await write(directory, 'status.json', {
        id: data.id,
        state: 'cancelled',
        actor: packet.actor,
      });
  }
}

export async function reportResult(directory, { observation, ended }) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await write(directory, 'result.json', { observation, ended: Boolean(ended) });
}
export async function resetChannel(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await write(directory, 'status.json', { state: 'idle' });
  await reportResult(directory, { observation: null, ended: false });
}
