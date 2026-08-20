const test = require('node:test');
const assert = require('node:assert/strict');
const { READERS } = require('../commands/list');

test('list exposes every Spec 8 read-only resource', () => {
  assert.deepEqual(Object.keys(READERS).sort(), [
    'deployments', 'functions', 'github-installations', 'github-repos', 'groups',
    'schedules', 'secrets', 'templates', 'tunnels',
  ]);
});

test('github-repos fails before network access without an installation id', () => {
  assert.throws(
    () => READERS['github-repos']({ get: () => assert.fail('network should not be called') }, {}),
    (error) => error.code === 'validation_failed',
  );
});
