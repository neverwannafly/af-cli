const { clearSessionToken, configPath } = require('../lib/config');
const output = require('../lib/output');

function logoutCommand(program) {
  program
    .command('logout')
    .description('Remove the stored API Frenzy session token')
    .action(() => {
      clearSessionToken();
      output.emit({ logged_out: true, config: configPath() });
    });
}

module.exports = { logoutCommand };
