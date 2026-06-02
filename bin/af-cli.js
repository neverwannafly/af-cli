#!/usr/bin/env node

const { program } = require('commander');
const packageJson = require('../package.json');
const { loginCommand } = require('../commands/login');
const { logoutCommand } = require('../commands/logout');
const { profileCommand } = require('../commands/profile');
const { versionCommand } = require('../commands/version');
const { tunnelCommand } = require('../commands/tunnel');

program
  .name('af-cli')
  .description('API Frenzy CLI - Command-line interface for the API Frenzy platform')
  .version(packageJson.version);

// Register commands
loginCommand(program);
logoutCommand(program);
profileCommand(program);
versionCommand(program);
tunnelCommand(program);

program.parse(process.argv);
