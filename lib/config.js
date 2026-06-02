const fs = require('fs');
const os = require('os');
const path = require('path');
const { readBuildProfile } = require('./build-profile');

const DEFAULT_TUNNEL_VISIBILITY = 'public_access';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'api-frenzy');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function readConfig() {
  let fileConfig = {};
  const profile = readBuildProfile();

  try {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read config at ${CONFIG_PATH}: ${error.message}`);
    }
  }

  return {
    profile,
    apiBaseUrl:
      process.env.AF_API_BASE_URL ||
      process.env.API_FRENZY_API_BASE_URL ||
      fileConfig.apiBaseUrl ||
      profile.defaultApiBaseUrl,
    sessionToken:
      process.env.AF_SESSION_TOKEN ||
      process.env.API_FRENZY_SESSION_TOKEN ||
      fileConfig.sessionToken,
    defaultTunnelVisibility:
      process.env.AF_DEFAULT_TUNNEL_VISIBILITY ||
      fileConfig.defaultTunnelVisibility ||
      DEFAULT_TUNNEL_VISIBILITY,
  };
}

function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(CONFIG_PATH, 0o600);
}

function updateConfig(updates) {
  const current = readConfig();
  const persisted = {};

  try {
    Object.assign(persisted, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read config at ${CONFIG_PATH}: ${error.message}`);
    }
  }

  writeConfig({
    ...persisted,
    ...updates,
    apiBaseUrl: updates.apiBaseUrl || persisted.apiBaseUrl || current.apiBaseUrl,
  });
}

function clearSessionToken() {
  const persisted = {};

  try {
    Object.assign(persisted, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw new Error(`Failed to read config at ${CONFIG_PATH}: ${error.message}`);
  }

  delete persisted.sessionToken;
  writeConfig(persisted);
}

function configPath() {
  return CONFIG_PATH;
}

module.exports = {
  DEFAULT_TUNNEL_VISIBILITY,
  readConfig,
  writeConfig,
  updateConfig,
  clearSessionToken,
  configPath,
};
