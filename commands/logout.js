const chalk = require('chalk');
const { clearSessionToken, configPath } = require('../lib/config');

function logoutCommand(program) {
  program
    .command('logout')
    .description('Remove the stored API Frenzy session token')
    .action(() => {
      clearSessionToken();
      console.log(chalk.green('[OK]'), 'Logged out');
      console.log(`Config: ${configPath()}`);
    });
}

module.exports = { logoutCommand };
