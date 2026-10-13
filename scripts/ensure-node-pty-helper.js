const { ensureSpawnHelperExecutable } = require('../lib/node-pty-helper');

try {
  if (ensureSpawnHelperExecutable().length) {
    console.log('Fixed executable permission for node-pty spawn-helper');
  }
} catch (error) {
  // Never fail an install over this; the CLI retries at runtime.
  console.warn(`Could not fix node-pty spawn-helper permissions: ${error.message}`);
}
