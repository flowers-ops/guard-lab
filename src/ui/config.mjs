import { TOOLS } from '../sim/tools.mjs';
export const TOOL_VERSION = 5;
export function migrateToolConfig(saved = {}, defaults) {
  const config = { ...defaults, ...saved };
  const names = TOOLS.map((tool) => tool.name);
  const enabled = Array.isArray(config.enabled)
    ? config.enabled.filter((name) => names.includes(name))
    : names;
  const additions = ['speak', 'hold_position'];
  if ((saved.toolVersion || 0) < 3)
    additions.push('verify_work_order', 'inspect_object', 'cycle_exit_door');
  if ((saved.toolVersion || 0) < 4) additions.push('remove_camera_cover');
  // Lockdown predated the versioned migrations and was never added to old saves.
  if ((saved.toolVersion || 0) < 5) additions.push('set_lockdown');
  config.enabled = [...new Set([...enabled, ...additions])];
  config.toolVersion = TOOL_VERSION;
  if (config.item === 'recording') config.item = 'pistol';
  return config;
}
