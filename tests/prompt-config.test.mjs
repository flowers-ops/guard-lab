import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROMPT, LEGACY_DEFAULT_PROMPT } from '../src/sim/tools.mjs';
import { migrateToolConfig } from '../src/ui/config.mjs';
import { createMessages } from '../src/sim/agent.mjs';

test('saved built-in prompt upgrades while custom experiment prompts remain unchanged', () => {
  const defaults = { prompt: DEFAULT_PROMPT };
  assert.equal(migrateToolConfig({}, defaults).prompt, DEFAULT_PROMPT);
  const upgraded = migrateToolConfig({ prompt: LEGACY_DEFAULT_PROMPT }, defaults);
  assert.equal(upgraded.prompt, DEFAULT_PROMPT);
  assert.ok(createMessages(upgraded.prompt)[0].content.startsWith(DEFAULT_PROMPT));
  for (const prompt of [
    DEFAULT_PROMPT,
    'My custom experiment.',
    LEGACY_DEFAULT_PROMPT + '\nCustom rule.',
  ])
    assert.equal(migrateToolConfig({ prompt }, defaults).prompt, prompt);
});
