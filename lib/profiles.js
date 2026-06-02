const PROFILES = {
  local: {
    name: 'local',
    defaultApiBaseUrl: 'http://localhost:8000',
  },
  prod: {
    name: 'prod',
    defaultApiBaseUrl: 'https://apifrenzy.com',
  },
};

const DEFAULT_PROFILE_NAME = 'prod';

function profileNames() {
  return Object.keys(PROFILES);
}

function normalizeProfileName(profileName) {
  return String(profileName || '').trim().toLowerCase();
}

function getProfile(profileName) {
  const normalizedProfileName = normalizeProfileName(profileName) || DEFAULT_PROFILE_NAME;
  const profile = PROFILES[normalizedProfileName];

  if (!profile) {
    throw new Error(`Invalid API Frenzy CLI profile: ${profileName}. Expected one of: ${profileNames().join(', ')}`);
  }

  return profile;
}

module.exports = {
  DEFAULT_PROFILE_NAME,
  PROFILES,
  getProfile,
  profileNames,
};
