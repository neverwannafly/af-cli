const packageJson = require('../package.json');
const output = require('../lib/output');
const { readConfig } = require('../lib/config');

function versionCommand(program) {
  program
    .command('version')
    .description('Display version information')
    .action(() => {
      output.emit({
        cli_version: packageJson.version,
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        profile: readConfig().profile.name,
      });
    });
}

module.exports = { versionCommand };
