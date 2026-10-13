const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const { TunnelAgent, buildLocalWebSocketOptions, parseSubprotocols } = require('../lib/tunnel-agent');

function startServer(wsOptions) {
  return new Promise((resolve) => {
    const received = { headers: null };
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', ...wsOptions });
    wss.on('connection', (ws, req) => {
      received.headers = req.headers;
      received.protocol = ws.protocol;
      ws.on('message', (data, binary) => ws.send(Buffer.concat([Buffer.from('echo:'), data]), { binary }));
    });
    wss.on('listening', () => resolve({ wss, port: wss.address().port, received }));
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

async function roundTrip(port, headers) {
  const { agent, sent, logs } = makeAgent(port);
  agent.openWebSocketStream({ stream_id: 's1', path: '/ws', headers });
  agent.writeWebSocketFrame({ stream_id: 's1', data_base64: Buffer.from('hi').toString('base64'), binary: false });
  await waitFor(() => sent.some((m) => m.type === 'ws_frame') || sent.some((m) => m.type === 'stream_close'));
  const result = { sent, logs };
  agent.closeStream('s1');
  return result;
}

test('parseSubprotocols handles strings, comma lists, arrays and absence', () => {
  assert.deepEqual(parseSubprotocols({ 'Sec-WebSocket-Protocol': 'tty' }), ['tty']);
  assert.deepEqual(parseSubprotocols({ 'sec-websocket-protocol': 'tty, binary' }), ['tty', 'binary']);
  assert.deepEqual(parseSubprotocols({ 'SEC-WEBSOCKET-PROTOCOL': ['a', 'b, c'] }), ['a', 'b', 'c']);
  assert.deepEqual(parseSubprotocols({ origin: 'x' }), []);
});

test('buildLocalWebSocketOptions strips ws-generated handshake headers only', () => {
  const { protocols, options } = buildLocalWebSocketOptions({
    'Sec-WebSocket-Key': 'k',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Extensions': 'permessage-deflate',
    'Sec-WebSocket-Protocol': 'tty',
    Origin: 'https://a.example',
    Cookie: 'a=b',
    Connection: 'Upgrade',
  });
  assert.deepEqual(protocols, ['tty']);
  assert.equal(options.headers.Origin, 'https://a.example');
  assert.equal(options.headers.Cookie, 'a=b');
  for (const name of Object.keys(options.headers)) {
    assert.doesNotMatch(name.toLowerCase(), /^sec-websocket-/);
  }
});

test('agent opens a subprotocol-requiring local server and frames flow both ways', async () => {
  const { wss, port, received } = await startServer({ handleProtocols: (p) => (p.has('tty') ? 'tty' : false) });
  try {
    const { sent, logs } = await roundTrip(port, { 'Sec-WebSocket-Protocol': 'tty', Origin: 'https://a.example' });
    assert.equal(sent.some((m) => m.type === 'stream_close'), false, JSON.stringify(sent));
    const frame = sent.find((m) => m.type === 'ws_frame');
    assert.equal(Buffer.from(frame.data_base64, 'base64').toString(), 'echo:hi');
    assert.equal(received.protocol, 'tty');
    assert.equal(received.headers.origin, 'https://a.example');
    assert.ok(logs.some((l) => l.method === 'OPEN'));
  } finally {
    wss.close();
  }
});

test('agent still works without a subprotocol header against a plain server', async () => {
  const { wss, port, received } = await startServer({});
  try {
    const { sent } = await roundTrip(port, { Origin: 'https://a.example' });
    assert.equal(sent.some((m) => m.type === 'stream_close'), false, JSON.stringify(sent));
    assert.equal(Buffer.from(sent.find((m) => m.type === 'ws_frame').data_base64, 'base64').toString(), 'echo:hi');
    assert.equal(received.protocol, '');
  } finally {
    wss.close();
  }
});
