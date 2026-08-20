#!/usr/bin/env node

const { program } = require('commander');
const packageJson = require('../package.json');
const { loginCommand } = require('../commands/login');
const { logoutCommand } = require('../commands/logout');
const { profileCommand } = require('../commands/profile');
const { versionCommand } = require('../commands/version');
const { tunnelCommand } = require('../commands/tunnel');
const { deployCommand } = require('../commands/deploy');
const { logsCommand } = require('../commands/logs');
const { statusCommand } = require('../commands/status');
const { releasesCommand } = require('../commands/releases');
const { rollbackCommand } = require('../commands/rollback');
const { doctorCommand } = require('../commands/doctor');
const { listCommand } = require('../commands/list');
const output = require('../lib/output');
const { AfError, normalizeError } = require('../lib/errors');

const initialFormat = output.requestedFormat();
output.installStdoutGuard();
try {
  output.configure({ format: initialFormat, color: !process.argv.includes('--no-color') });
} catch (error) {
  output.configure({ format: 'json', color: false });
  process.exitCode = output.fail(normalizeError(error));
  return;
}

if (!process.argv.includes('tunnel')) {
  let canceling = false;
  process.on('SIGINT', () => {
    if (canceling) return;
    canceling = true;
    process.exitCode = output.fail(new AfError('Operation canceled by SIGINT', { code: 'canceled' }));
    setImmediate(() => process.exit(process.exitCode));
  });
}

program
  .name('af-cli')
  .description('API Frenzy CLI - Command-line interface for the API Frenzy platform')
  .version(packageJson.version)
  .option('-o, --output <format>', 'Output format: table, json, or yaml', initialFormat)
  .option('--no-color', 'Disable colour')
  .option('--yes', 'Confirm destructive operations non-interactively')
  .exitOverride()
  .configureOutput({ writeOut: (text) => process.stderr.write(text), writeErr: (text) => process.stderr.write(text) });

program.addHelpText('after', `
Machine output:
  -o table|json|yaml   Finite commands emit one versioned result document.
  logs --follow        Emits NDJSON; progress and diagnostics always use stderr.

Exit codes:
  0 success                 1 general/upstream          2 authentication/authorization
  3 not found               4 validation                5 conflict
  6 quota/account decision  7 build/verification failed 8 wait timed out (inconclusive)
  130 interrupted or confirmation declined/unavailable
`);

// Register commands
loginCommand(program);
logoutCommand(program);
profileCommand(program);
versionCommand(program);
tunnelCommand(program);
deployCommand(program);
logsCommand(program);
statusCommand(program);
releasesCommand(program);
rollbackCommand(program);
doctorCommand(program);
listCommand(program);

program.parseAsync(process.argv).catch((error) => {
  const normalized = normalizeError(error);
  if (!normalized) return;
  process.exitCode = output.fail(normalized);
});
