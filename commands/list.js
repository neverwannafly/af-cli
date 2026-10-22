const { ApiClient } = require('../lib/api-client');
const output = require('../lib/output');
const { AfError } = require('../lib/errors');
const { unwrapMany, positiveInteger } = require('../lib/command-utils');

const READERS = Object.freeze({
  deployments: (client) => client.get('/api/deployments'),
  functions: (client) => client.get('/api/functions'),
  schedules: (client) => client.post('/api/scheduled_entities/list', {}),
  tunnels: (client) => client.get('/api/tunnels'),
  secrets: (client) => client.get('/api/secrets'),
  templates: (client) => client.get('/api/deployments/templates'),
  groups: (client) => client.get('/api/deployment_groups'),
  'github-installations': (client) => client.get('/api/github/installations'),
  'github-repos': (client, options) => {
    if (!options.installationId) {
      throw new AfError('--installation-id is required when listing github-repos', { code: 'validation_failed' });
    }
    return client.get(`/api/github/installations/${positiveInteger(options.installationId, '--installation-id')}/repos`);
  },
});

// GitHub endpoints return a keyed object (e.g. { repositories: [...] }) rather than a bare array.
function unwrapRows(payload) {
  const data = payload?.data ?? payload;
  if (data && !Array.isArray(data)) {
    const keyed = data.repositories ?? data.installations ?? data.items;
    if (Array.isArray(keyed)) return unwrapMany(keyed);
  }
  return unwrapMany(payload);
}

function listCommand(program) {
  program.command('list <resource>')
    .description('List deployments, functions, schedules, tunnels, secrets, templates, groups, or GitHub resources')
    .option('--installation-id <id>', 'GitHub App installation id for github-repos')
    .action(async (resource, options) => {
      const reader = READERS[resource];
      if (!reader) {
        throw new AfError(`Unknown list resource: ${resource}`, {
          code: 'validation_failed',
          details: { allowed: Object.keys(READERS) },
        });
      }
      const rows = unwrapRows(await reader(new ApiClient(), options));
      output.emit({ resource, items: rows });
    });
}

module.exports = { listCommand, READERS, unwrapRows };
