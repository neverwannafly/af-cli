const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDeployOptions } = require('../commands/deploy');
const { envMap } = require('../lib/command-utils');

function defaults(overrides = {}) {
  return { name: 'app', image: 'nginx', repo: undefined, repoId: undefined, installationId: undefined,
    group: undefined, groupId: undefined, buildType: 'dockerfile', startCommand: undefined,
    visibility: 'public_access', ...overrides };
}

test('deploy validates source exclusivity and reserved names before network access', () => {
  assert.throws(() => validateDeployOptions(defaults({ repo: 'o/r', installationId: '1' })), /exactly one source/);
  assert.throws(() => validateDeployOptions(defaults({ name: 'bad-dp-name' })), /reserved markers/);
  assert.doesNotThrow(() => validateDeployOptions(defaults()));
  assert.throws(() => validateDeployOptions(defaults({ visibility: 'internet' })), /visibility/);
});

test('deploy rejects source-specific flags before network access', () => {
  const explicit = (names) => ({ getOptionValueSource: (name) => (names.includes(name) ? 'cli' : 'default') });
  assert.throws(
    () => validateDeployOptions(defaults({ branch: 'main' }), explicit(['branch'])),
    /only for a GitHub deploy/,
  );
  assert.throws(
    () => validateDeployOptions(defaults({ image: undefined, repo: 'o/r', installationId: '1', buildCommand: 'npm run build' }), explicit(['buildCommand'])),
    /not valid for --build-type dockerfile/,
  );
});

test('environment values split on the first equals sign', () => {
  assert.deepEqual(envMap(['URL=https://example.test?a=b', 'EMPTY=']), { URL: 'https://example.test?a=b', EMPTY: '' });
});
