const os = require('node:os');
const path = require('node:path');

function dataDirectory({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
} = {}) {
  if (env.GUARD_LAB_DATA_DIR) return path.resolve(env.GUARD_LAB_DATA_DIR);
  const base =
    platform === 'win32'
      ? env.APPDATA || path.join(home, 'AppData', 'Roaming')
      : platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support')
        : env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(base, 'Guard Lab');
}
function bridgeDirectory(actor = 'robot', options = {}) {
  if (!['robot', 'human'].includes(actor)) throw new Error('Actor must be robot or human.');
  const env = options.env || process.env;
  const override = actor === 'human' ? env.GUARD_LAB_HUMAN_BRIDGE : env.GUARD_LAB_BRIDGE;
  return override ? path.resolve(override) : path.join(dataDirectory(options), actor + '-bridge');
}
module.exports = { dataDirectory, bridgeDirectory };
