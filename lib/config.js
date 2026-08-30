const fs = require('fs');
const os = require('os');
const path = require('path');
const { readBuildProfile } = require('./build-profile');

const DEFAULT_TUNNEL_VISIBILITY = 'public_access';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'api-frenzy');

function getConfigPath() {
  const profile = readBuildProfile();
  const filename = profile.name === 'prod' ? 'config.json' : 'dev.config.json';
  return path.join(CONFIG_DIR, filename);
}

function readConfig() {
  let fileConfig = {};
  const profile = readBuildProfile();
  const configPath = getConfigPath();

  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read config at ${configPath}: ${error.message}`);
    }
  }

  return {
    profile,
    apiBaseUrl:
      process.env.AF_API_URL ||
      process.env.AF_API_BASE_URL ||
      process.env.API_FRENZY_API_BASE_URL ||
      fileConfig.apiBaseUrl ||
      profile.defaultApiBaseUrl,
    sessionToken:
      process.env.AF_TOKEN ||
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
  const configPath = getConfigPath();
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
}

function updateConfig(updates) {
  const current = readConfig();
  const persisted = {};
  const configPath = getConfigPath();

  try {
    Object.assign(persisted, JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read config at ${configPath}: ${error.message}`);
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
  const configPath = getConfigPath();

  try {
    Object.assign(persisted, JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw new Error(`Failed to read config at ${configPath}: ${error.message}`);
  }

  delete persisted.sessionToken;
  writeConfig(persisted);
}

function configPath() {
  return getConfigPath();
}

module.exports = {
  DEFAULT_TUNNEL_VISIBILITY,
  readConfig,
  writeConfig,
  updateConfig,
  clearSessionToken,
  configPath,
};
