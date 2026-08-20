const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const cli = path.resolve(__dirname, '../bin/af-cli.js');

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('finite commands emit exactly one JSON document against a fake API subprocess', async () => {
  const env = {
    AF_API_URL: 'http://fake-api.test',
    AF_TOKEN: 'test-token',
    NODE_OPTIONS: `--require ${path.resolve(__dirname, 'fake-fetch.js')}`,
  };

  for (const args of [
    ['status', 'demo', '-o', 'json'],
    ['logs', 'demo', '-o', 'json'],
    ['releases', 'demo', '-o', 'json'],
    ['doctor', '-o', 'json'],
    ['list', 'deployments', '-o', 'json'],
    ['rollback', 'demo', '2', '--wait', '--timeout', '5s', '--yes', '-o', 'json'],
    ['deploy', '--image', 'nginx:alpine', '--name', 'demo', '--wait', '--timeout', '5s', '-o', 'json'],
  ]) {
    const result = await run(args, env);
    assert.equal(result.code, 0, `${args.join(' ')}: ${result.stderr}`);
    assert.equal(result.stdout.trim().split('\n').length, 1);
    assert.equal(JSON.parse(result.stdout).output_version, 1);
  }
});

test('parse and API failures preserve one stdout JSON error and mapped exit code', async () => {
  const parse = await run(['unknown-command', '-ojson']);
  assert.equal(parse.code, 4);
  assert.equal(JSON.parse(parse.stdout).error.code, 'validation_failed');

  const missing = await run(['status', 'missing', '-o', 'json'], { AF_API_URL: 'http://127.0.0.1:1', AF_TOKEN: 'x' });
  assert.equal(missing.code, 1);
  assert.equal(JSON.parse(missing.stdout).error.code, 'upstream_unavailable');

  const confirmation = await run(['rollback', 'demo', '2', '-o', 'json'], { AF_API_URL: 'http://fake-api.test', AF_TOKEN: 'x' });
  assert.equal(confirmation.code, 130);
  assert.equal(JSON.parse(confirmation.stdout).error.code, 'canceled');
});

test('deploy --wait attaches to an existing in-flight execution', async () => {
  const result = await run(['deploy', '--image', 'nginx:alpine', '--name', 'demo', '--wait', '--timeout', '5s', '-o', 'json'], {
    AF_API_URL: 'http://fake-api.test', AF_TOKEN: 'test-token', AF_FAKE_ACTIVE: '1',
    NODE_OPTIONS: `--require ${path.resolve(__dirname, 'fake-fetch.js')}`,
  });
  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.attached, true);
  assert.equal(payload.execution.id, '10');
});

test('SIGINT during a finite wait emits one canceled JSON envelope and exits 130', async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'deploy', '--image', 'nginx:alpine', '--name', 'demo', '--wait', '-o', 'json'], {
      env: {
        ...process.env, AF_API_URL: 'http://fake-api.test', AF_TOKEN: 'test-token',
        NODE_OPTIONS: `--require ${path.resolve(__dirname, 'fake-fetch-pending.js')}`,
      },
    });
    let stdout = ''; let stderr = ''; let signaled = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CLI did not enter wait state')); }, 3000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (!signaled && stderr.includes('Pipeline 10: running')) { signaled = true; child.kill('SIGINT'); }
    });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  assert.equal(result.code, 130, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(result.stdout).error.code, 'canceled');
});

test('finite yaml is valid YAML 1.2 JSON subset and streaming yaml is rejected', async () => {
  const finite = await run(['status', 'demo', '-o', 'yaml'], {
    AF_API_URL: 'http://fake-api.test', AF_TOKEN: 'test-token',
    NODE_OPTIONS: `--require ${path.resolve(__dirname, 'fake-fetch.js')}`,
  });
  assert.equal(finite.code, 0, finite.stderr);
  assert.equal(JSON.parse(finite.stdout).output_version, 1);
  const stream = await run(['logs', 'demo', '--follow', '-o', 'yaml'], { AF_API_URL: 'http://fake-api.test', AF_TOKEN: 'test-token' });
  assert.equal(stream.code, 4);
  assert.match(stream.stderr, /not yaml/);
});
