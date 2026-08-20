const { ApiClient } = require('../lib/api-client');
const output = require('../lib/output');
const { unwrapOne } = require('../lib/command-utils');

function statusCommand(program) {
  program.command('status <slug>')
    .description('Show deployment and durable verification status')
    .action(async (slug) => {
      const client = new ApiClient();
      const deployment = unwrapOne(await client.getDeployment(slug));
      let verification = deployment.verification || null;
      try { verification = await client.getVerification(slug); } catch (error) { if (error.code !== 'not_found') throw error; }
      output.emit({ deployment, verification });
    });
}

module.exports = { statusCommand };
