const { ApiClient } = require('../lib/api-client');
const output = require('../lib/output');
const { AfError } = require('../lib/errors');
const { positiveInteger, durationMs, delay, confirm } = require('../lib/command-utils');

async function waitForRollbackVerification(client, slug, releaseId, timeout) {
  const deadline = Date.now() + durationMs(timeout);
  let verification;
  while (Date.now() < deadline) {
    try { verification = await client.getVerification(slug); } catch (error) { if (error.code !== 'not_found') throw error; }
    if (!verification || String(verification.requested_release_id) !== String(releaseId)) {
      await delay(1000);
      continue;
    }
    if (verification?.state === 'converged') return verification;
    if (verification?.state === 'failed') throw new AfError(verification.detail?.message || 'Rollback verification failed', { code: 'deployment_verification_failed', details: verification });
    await delay(1000);
  }
  throw new AfError('Timed out waiting for rollback verification', { code: 'timeout', details: { verification: verification || 'inconclusive' } });
}

function rollbackCommand(program) {
  program.command('rollback <slug> <release-sequence>')
    .description('Create a forward rollback release; current secrets and storage are retained')
    .option('--wait', 'Wait for server-side verification of the rollback release')
    .option('--timeout <duration>', 'Wait deadline', '10m')
    .action(async (slug, sequence, options, command) => {
      await confirm(`Create a forward rollback of ${slug} to release ${sequence}?`, command.optsWithGlobals().yes);
      const client = new ApiClient();
      const result = await client.rollback(slug, positiveInteger(sequence, 'release-sequence'));
      const releaseData = result?.release?.data || result?.release;
      const release = releaseData?.attributes ? { id: releaseData.id, ...releaseData.attributes } : releaseData;
      let verification = null;
      if (options.wait) verification = await waitForRollbackVerification(client, slug, release.id, options.timeout);
      output.emit({ ...result, verification });
    });
}

module.exports = { rollbackCommand, waitForRollbackVerification };
