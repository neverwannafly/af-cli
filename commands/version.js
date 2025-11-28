const packageJson = require('../package.json');
const chalk = require('chalk');

function versionCommand(program) {
  program
    .command('version')
    .description('Display version information')
    .action(() => {
      console.log(chalk.green('[OK]'), `af-cli version ${packageJson.version}`);
      console.log(chalk.cyan('[->]'), `Node.js ${process.version}`);
      console.log(chalk.cyan('[->]'), `Platform: ${process.platform} ${process.arch}`);
    });
}

module.exports = { versionCommand };

