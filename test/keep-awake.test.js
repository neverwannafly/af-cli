const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { startKeepAwake, commandFor } = require('../lib/keep-awake');

function fakeSpawn() {
  const calls = [];
  const fn = (file, args) => {
    const child = new EventEmitter();
    child.unref = () => {};
    child.kill = () => { child.killed = true; };
    calls.push({ file, args, child });
    return child;
  };
  fn.calls = calls;
  return fn;
}

test('macOS uses caffeinate tied to our pid', () => {
  assert.deepStrictEqual(commandFor(42, 'darwin'), { file: 'caffeinate', args: ['-i', '-w', '42'] });
});

test('linux uses systemd-inhibit', () => {
  assert.strictEqual(commandFor(42, 'linux').file, 'systemd-inhibit');
});

test('unsupported platform is a no-op', () => {
  assert.strictEqual(startKeepAwake({ platform: 'win32', spawnFn: fakeSpawn() }).active, false);
});

test('disabled does not spawn', () => {
  const spawnFn = fakeSpawn();
  assert.strictEqual(startKeepAwake({ enabled: false, platform: 'darwin', spawnFn }).active, false);
  assert.strictEqual(spawnFn.calls.length, 0);
});

test('stop kills the child; missing binary deactivates', () => {
  const spawnFn = fakeSpawn();
  const handle = startKeepAwake({ platform: 'darwin', spawnFn });
  assert.strictEqual(handle.active, true);
  spawnFn.calls[0].child.emit('error', new Error('ENOENT'));
  assert.strictEqual(handle.active, false);
  handle.stop();
});
