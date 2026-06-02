const buildProfile = require('./build-profile.generated.json');
const { getProfile } = require('./profiles');

function readBuildProfile() {
  return getProfile(
    process.env.AF_CLI_PROFILE ||
    process.env.API_FRENZY_CLI_PROFILE ||
    buildProfile.profile
  );
}

module.exports = {
  readBuildProfile,
};
