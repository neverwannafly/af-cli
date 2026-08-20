const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ApiClient } = require('../lib/api-client');
const { AfError } = require('../lib/errors');
const { waitForVerification } = require('../commands/deploy');
const { emitLogData } = require('../commands/logs');
const { unwrapOne, unwrapMany } = require('../lib/command-utils');

test('runtime stdout guard rejects package-owned direct writes', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'stdout-violation-fixture.js')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Direct stdout writes are forbidden/);
});

test('runtime stdout guard redirects unknown third-party writes to stderr', () => {
  const script = `const output = require(${JSON.stringify(path.resolve(__dirname, '../lib/output.js'))}); output.installStdoutGuard(); console.log('dependency noise');`;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', cwd: os.tmpdir() });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'dependency noise\n');
});

test('API client sends the exact image payload and auth headers', async () => {
  const previousFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ data: { id: '41', attributes: { status: 'pending' } } }), { status: 201 });
  };
  try {
    const client = new ApiClient({ apiBaseUrl: 'https://api.example.test/', sessionToken: 'ephemeral-token' });
    await client.deployImage({ source_image: 'nginx@sha256:abc', deployment_name: 'web', env_vars: { A: 'b=c' } });
    assert.equal(request.url, 'https://api.example.test/api/pipelines/execute');
    assert.equal(request.options.headers.Authorization, 'Bearer ephemeral-token');
    assert.equal(request.options.headers['X-Session-Token'], 'ephemeral-token');
    assert.deepEqual(JSON.parse(request.options.body), {
      pipeline_slug: 'deploy-custom-dockerfile',
      execution_args: { image_tag: 'latest', source_image: 'nginx@sha256:abc', deployment_name: 'web', env_vars: { A: 'b=c' } },
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test('API client sends GitHub deploy parameters as a flat top-level payload', async () => {
  const previousFetch = global.fetch;
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: { id: '42', attributes: { status: 'pending' } } }), { status: 201 });
  };
  try {
    const client = new ApiClient({ apiBaseUrl: 'https://api.example.test', sessionToken: 'token' });
    await client.deployGithub({ installation_id: 300, repo_full_name: 'acme/web', build_type: 'node', deployment_name: 'web', port: 3000 });
    assert.deepEqual(body, { installation_id: 300, repo_full_name: 'acme/web', build_type: 'node', deployment_name: 'web', port: 3000 });
    assert.equal(body.execution_args, undefined);
  } finally {
    global.fetch = previousFetch;
  }
});

test('API errors preserve server code and details', () => {
  const error = AfError.fromResponse(402, { error: 'Limit reached', code: 'quota_exceeded', details: { limit: 1, used: 1 } });
  assert.equal(error.code, 'quota_exceeded');
  assert.equal(error.exitCode, 6);
  assert.deepEqual(error.details, { limit: 1, used: 1 });
});

test('JSON:API records unwrap without losing ids and plain payloads pass through', () => {
  assert.deepEqual(unwrapOne({ data: { id: '7', attributes: { status: 'running' } } }), { id: '7', status: 'running' });
  assert.deepEqual(unwrapMany({ data: [{ id: '8', attributes: { sequence: 2 } }] }), [{ id: '8', sequence: 2 }]);
  assert.deepEqual(unwrapOne({ id: 9, state: 'converged' }), { id: 9, state: 'converged' });
});

test('verification ignores a converged verdict from another pipeline execution', async () => {
  const stale = { id: 1, pipeline_execution_id: 8, requested_release_id: 3, state: 'converged' };
  await assert.rejects(
    waitForVerification({ getVerification: async () => stale }, 'web', Date.now() + 5, { pipelineExecutionId: 9 }, 0),
    (error) => error.code === 'timeout',
  );
  const exact = { id: 2, pipeline_execution_id: 9, requested_release_id: 4, state: 'converged' };
  assert.equal(await waitForVerification({ getVerification: async () => exact }, 'web', Date.now() + 50, { pipelineExecutionId: 9 }, 0), exact);
});

test('SSE log replay is deduplicated across reconnects', () => {
  const seen = new Set();
  const order = [];
  const events = [];
  const emitter = (event, data) => events.push({ event, data });
  const line = JSON.stringify({ pod: 'web-1', timestamp: '2026-01-01T00:00:00Z', line: 'ready' });
  assert.equal(emitLogData(line, seen, order, emitter), true);
  assert.equal(emitLogData(line, seen, order, emitter), false);
  assert.deepEqual(events, [{ event: 'log', data: { pod: 'web-1', timestamp: '2026-01-01T00:00:00Z', line: 'ready' } }]);
});

test('environment token wins at runtime and is never persisted by unrelated config updates', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cli-config-'));
  const script = `
    const fs = require('fs');
    const config = require(${JSON.stringify(path.resolve(__dirname, '../lib/config.js'))});
    config.updateConfig({ defaultTunnelVisibility: 'private_access' });
    const runtime = config.readConfig();
    const persisted = JSON.parse(fs.readFileSync(config.configPath(), 'utf8'));
    process.stdout.write(JSON.stringify({ runtime, persisted }));
  `;
  try {
    const result = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, HOME: tempHome, AF_API_URL: 'https://ci.example.test', AF_TOKEN: 'ci-only-token' },
    });
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.runtime.apiBaseUrl, 'https://ci.example.test');
    assert.equal(value.runtime.sessionToken, 'ci-only-token');
    assert.equal(value.persisted.sessionToken, undefined);
    assert.equal(value.persisted.apiBaseUrl, 'https://ci.example.test');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
