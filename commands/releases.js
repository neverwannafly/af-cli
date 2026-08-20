const { ApiClient } = require('../lib/api-client');
const output = require('../lib/output');
const { unwrapMany, unwrapOne } = require('../lib/command-utils');

function releasesCommand(program) {
  program.command('releases <slug>')
    .description('List immutable deployment releases')
    .option('--limit <count>', 'Maximum rows', '20')
    .option('--before-sequence <sequence>')
    .option('--sequence <sequence>', 'Fetch one release with its masked manifest')
    .action(async (slug, options) => {
      const client = new ApiClient();
      if (options.sequence) {
        return output.emit({ release: unwrapOne(await client.get(`/api/deployments/${encodeURIComponent(slug)}/releases/${encodeURIComponent(options.sequence)}`)) });
      }
      output.emit({ releases: unwrapMany(await client.listReleases(slug, { limit: options.limit, before_sequence: options.beforeSequence })) });
    });
}

module.exports = { releasesCommand };
