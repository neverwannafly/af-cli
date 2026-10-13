const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTunnelVisibility } = require('../commands/tunnel');
const { ApiClient } = require('../lib/api-client');

test('tunnel visibility is omitted unless explicitly provided', () => {
  assert.equal(resolveTunnelVisibility({}, {}), undefined);
  assert.equal(resolveTunnelVisibility({}, { defaultTunnelVisibility: '' }), undefined);
});

test('tunnel visibility prefers the flag over configured default', () => {
  assert.equal(resolveTunnelVisibility({ visibility: 'private_access' }, { defaultTunnelVisibility: 'public_access' }), 'private_access');
  assert.equal(resolveTunnelVisibility({}, { defaultTunnelVisibility: 'private_access' }), 'private_access');
});

test('tunnel visibility rejects invalid values', () => {
  assert.throws(() => resolveTunnelVisibility({ visibility: 'internet' }, {}), /visibility/);
  assert.throws(() => resolveTunnelVisibility({}, { defaultTunnelVisibility: 'nope' }), /visibility/);
});

test('createTunnel omits visibility from the request body when undefined', async () => {
  const original = global.fetch;
  let body;
  global.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ data: { attributes: {} } }), text: async () => '{}' };
  };
  try {
    const client = new ApiClient({ apiBaseUrl: 'http://x.test', sessionToken: 'Bearer t' });
    await client.createTunnel({ name: 'a', localPort: 3000, visibility: undefined }).catch(() => {});
    assert.deepEqual(body, { tunnel: { name: 'a', local_port: 3000 } });
  } finally {
    global.fetch = original;
  }
});
