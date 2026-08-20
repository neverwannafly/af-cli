const test = require('node:test');
const assert = require('node:assert/strict');
const { ERROR_EXIT_CODES, EXIT_CODES } = require('../lib/exit-codes');

test('every public error code has one documented exit code', () => {
  const expected = [
    'unauthorized', 'forbidden', 'not_found', 'already_exists', 'validation_failed',
    'precondition_not_met', 'invalid_state', 'quota_exceeded', 'account_not_activated',
    'build_failed', 'deployment_verification_failed', 'upstream_unavailable',
    'rate_limited', 'internal_error', 'timeout', 'canceled',
  ];
  assert.deepEqual(Object.keys(ERROR_EXIT_CODES).sort(), expected.sort());
  assert.deepEqual(EXIT_CODES, { ok: 0, general: 1, auth: 2, not_found: 3, validation: 4, conflict: 5, quota: 6, verification_failed: 7, timeout: 8, canceled: 130 });
});
