const fs = require('fs');
const path = require('path');
const { getProfile, profileNames } = require('../lib/profiles');

const profileName = process.argv[2];

if (!profileName) {
  console.error(`Usage: node scripts/build-profile.js <${profileNames().join('|')}>`);
  process.exit(1);
}

let profile;

try {
  profile = getProfile(profileName);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const outputPath = path.join(__dirname, '..', 'lib', 'build-profile.generated.json');
fs.writeFileSync(outputPath, `${JSON.stringify({ profile: profile.name }, null, 2)}\n`);
console.log(`Built af-cli ${profile.name} profile`);
