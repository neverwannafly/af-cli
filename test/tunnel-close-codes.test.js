const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;
const { TunnelAgent } = require('../lib/tunnel-agent');
const { safeCloseCode, safeCloseReason, MAX_CLOSE_REASON_BYTES } = require('../lib/ws-close');

function startServer() {
  return new Promise((resolve) => {
    const closes = [];
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    wss.on('connection', (ws) => {
      ws.on('message', (data, binary) => ws.send(data, { binary }));
      ws.on('close', (code, reason) => closes.push({ code, reason: reason.toString() }));
    });
    wss.on('listening', () => resolve({ wss, port: wss.address().port, closes }));
  });
}

function makeAgent(port) {
  const sent = [];
  const logs = [];
  const agent = new TunnelAgent({ localPort: port, onLog: (entry) => logs.push(entry) });
  agent.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
  return { agent, sent, logs };
}

async function waitFor(fn) {
  for (let i = 0; i < 200; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
}

function frame(message) {
  return Buffer.from(JSON.stringify(message));
}

async function openStream(agent, sent, streamId) {
  agent.handleMessage(frame({ type: 'ws_open', stream_id: streamId, path: '/ws', headers: {} }));
  agent.handleMessage(frame({
    type: 'ws_frame', stream_id: streamId, data_base64: Buffer.from('hi').toString('base64'), binary: false,
  }));
  await waitFor(() => sent.some((m) => m.type === 'ws_frame' && m.stream_id === streamId));
}

test('safeCloseCode keeps sendable codes and maps the rest', () => {
  for (const code of [1000, 1001, 1003, 1007, 1011, 1014, 3000, 4999]) assert.equal(safeCloseCode(code), code);
  assert.equal(safeCloseCode(undefined), 1000);
  assert.equal(safeCloseCode(null), 1000);
  assert.equal(safeCloseCode(1005), 1000);
  for (const code of [1004, 1006, 1015, 999, 1016, 2999, 5000, 1000.5, '1000', NaN]) {
    assert.equal(safeCloseCode(code), 1011, String(code));
  }
});

test('safeCloseReason fits the 123-byte limit without splitting characters', () => {
  assert.equal(safeCloseReason(undefined), '');
  assert.equal(safeCloseReason('bye'), 'bye');
  const long = safeCloseReason('é'.repeat(200));
  assert.ok(Buffer.byteLength(long) <= MAX_CLOSE_REASON_BYTES);
  assert.equal(long, 'é'.repeat(61));
});

for (const [label, close] of [
  ['code 1006', { code: 1006, reason: 'phone went to sleep' }],
  ['no code', {}],
  ['code 1005 with an oversized reason', { code: 1005, reason: 'x'.repeat(500) }],
]) {
  test(`stream_close with ${label} closes the local socket without throwing`, async () => {
    const { wss, port, closes } = await startServer();
    try {
      const { agent, sent } = makeAgent(port);
      await openStream(agent, sent, 's1');

      assert.doesNotThrow(() => agent.handleMessage(frame({ type: 'stream_close', stream_id: 's1', ...close })));
      assert.equal(agent.wsStreams.has('s1'), false);
      await waitFor(() => closes.length === 1);
      assert.ok([1000, 1011].includes(closes[0].code), JSON.stringify(closes));

      // agent is still alive and serving new streams
      await openStream(agent, sent, 's2');
      agent.closeStream('s2');
      await waitFor(() => closes.length === 2);
    } finally {
      wss.close();
    }
  });
}

test('local close with no status is forwarded upstream as a sendable code', async () => {
  const { wss, port } = await startServer();
  try {
    const { agent, sent } = makeAgent(port);
    await openStream(agent, sent, 's1');
    for (const client of wss.clients) client.terminate();
    await waitFor(() => sent.some((m) => m.type === 'stream_close'));
    const msg = sent.find((m) => m.type === 'stream_close');
    assert.equal(msg.code, 1011);
  } finally {
    wss.close();
  }
});

test('a frame whose handler throws does not escape handleMessage', () => {
  const { agent, logs } = makeAgent(1);
  agent.wsStreams.set('bad', { socket: { readyState: WebSocket.OPEN, send() { throw new Error('boom'); } } });
  assert.doesNotThrow(() => agent.handleMessage(frame({ type: 'ws_frame', stream_id: 'bad', data_base64: '' })));
  assert.ok(logs.some((l) => l.method === 'ERROR' && /boom/.test(l.note)));
});
