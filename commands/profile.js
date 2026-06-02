const chalk = require('chalk');
const { readConfig } = require('../lib/config');

function profileCommand(program) {
  program
    .command('profile')
    .description('Show the active API Frenzy CLI profile')
    .action(() => {
      const config = readConfig();

      console.log(chalk.green('[OK]'), `Profile: ${config.profile.name}`);
      console.log(`API base URL: ${config.apiBaseUrl}`);
    });
}

module.exports = { profileCommand };
