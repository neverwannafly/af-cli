const { ApiClient } = require('../lib/api-client');
const output = require('../lib/output');
const { readConfig, configPath } = require('../lib/config');

async function check(name, fn) {
  try { return { name, ok: true, data: await fn() }; } catch (error) { return { name, ok: false, code: error.code || 'internal_error', message: error.message }; }
}

function doctorCommand(program) {
  program.command('doctor').description('Run independent connectivity, authentication, quota, and GitHub checks')
    .action(async () => {
      const config = readConfig();
      const client = new ApiClient();
      const checks = await Promise.all([
        check('config', async () => ({ path: configPath(), api_url: config.apiBaseUrl, token_present: client.hasSessionToken() })),
        check('health', () => client.request('GET', '/api/health_check', { auth: false })),
        check('auth', () => client.get('/api/oauth2/me')),
        check('quota', () => client.get('/api/billing/quota')),
        check('github', () => client.get('/api/github/installations')),
      ]);
      const ok = checks.every((entry) => entry.ok);
      output.emit({ ok, checks });
      if (!ok) process.exitCode = 1;
    });
}

module.exports = { doctorCommand };
