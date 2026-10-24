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

test('deploy allows --port with --image and sends it as ports', () => {
  const { commonArgs } = require('../commands/deploy');
  const explicit = { getOptionValueSource: (name) => (name === 'port' ? 'cli' : 'default') };
  const options = defaults({ port: '80', secretId: [], env: [] });
  assert.doesNotThrow(() => validateDeployOptions(options, explicit));
  assert.deepEqual(commonArgs(options).ports, [80]);
});

test('deploy allows --port for a dockerfile GitHub deploy and sends it as ports', () => {
  const { commonArgs } = require('../commands/deploy');
  const explicit = { getOptionValueSource: (name) => (name === 'port' ? 'cli' : 'default') };
  const options = defaults({ image: undefined, repo: 'o/r', installationId: '1', port: '8000', secretId: [], env: [] });
  assert.doesNotThrow(() => validateDeployOptions(options, explicit));
  assert.deepEqual(commonArgs(options).ports, [8000]);
});

test('deploy allows --port for a node GitHub deploy', () => {
  const explicit = { getOptionValueSource: (name) => (name === 'port' ? 'cli' : 'default') };
  assert.doesNotThrow(() => validateDeployOptions(defaults({ image: undefined, repo: 'o/r', installationId: '1', buildType: 'node', port: '4000' }), explicit));
});

test('deploy rejects --port for a static GitHub deploy', () => {
  assert.throws(
    () => validateDeployOptions(defaults({ image: undefined, repo: 'o/r', installationId: '1', buildType: 'static', port: '80' })),
    /--port is not valid for --build-type static/,
  );
});
