const test = require('node:test');
const assert = require('node:assert/strict');
const { TunnelReconnector } = require('../lib/tunnel-reconnector');

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

test('reconnects after an established agent disconnects', async () => {
  const agents = [];
  const timers = [];
  const statuses = [];
  const reconnector = new TunnelReconnector({
    createAgent: ({ onClose }) => {
      const started = deferred();
      const agent = { start: () => started.promise, close: () => {}, onClose, started };
      agents.push(agent);
      return agent;
    },
    onStatus: (status) => statuses.push(status),
    retryDelays: [10],
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn: () => {},
  });

  const ready = reconnector.start();
  agents[0].started.resolve();
  await ready;

  agents[0].onClose(new Error('gateway closed'));
  assert.equal(timers[0].delay, 10);
  timers[0].callback();
  agents[1].started.resolve();
  await Promise.resolve();

  assert.deepEqual(statuses.map((status) => status.state), ['connected', 'reconnecting', 'reconnected']);
});

test('keeps retrying when the initial gateway connection fails', async () => {
  const timers = [];
  const statuses = [];
  let calls = 0;
  const reconnector = new TunnelReconnector({
    createAgent: ({ onClose }) => {
      calls += 1;
      return {
        start: () => (calls === 1 ? Promise.reject(new Error('gateway unavailable')) : Promise.resolve()),
        close: () => {},
        onClose,
      };
    },
    onStatus: (status) => statuses.push(status),
    retryDelays: [10],
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn: () => {},
  });

  const ready = reconnector.start();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(timers[0].delay, 10);

  timers[0].callback();
  await ready;

  assert.deepEqual(statuses.map((status) => status.state), ['reconnecting', 'reconnected']);
});

test('stopping cancels a pending reconnect', async () => {
  const timers = [];
  let cleared = null;
  const reconnector = new TunnelReconnector({
    createAgent: ({ onClose }) => ({ start: () => Promise.reject(new Error('unavailable')), close: () => {}, onClose }),
    retryDelays: [10],
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return 42; },
    clearTimeoutFn: (timer) => { cleared = timer; },
  });

  reconnector.start();
  await Promise.resolve();
  await Promise.resolve();
  reconnector.stop();

  assert.equal(timers.length, 1);
  assert.equal(cleared, 42);
});
