const { readConfig } = require('../lib/config');
const output = require('../lib/output');

function profileCommand(program) {
  program
    .command('profile')
    .description('Show the active API Frenzy CLI profile')
    .action(() => {
      const config = readConfig();

      output.emit({ profile: config.profile.name, api_url: config.apiBaseUrl });
    });
}

module.exports = { profileCommand };
