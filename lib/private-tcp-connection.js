const net = require('net');
const WebSocket = require('ws');

class PrivateTcpConnection {
  constructor({ localPort, gatewayUrl, ticket, onError }) {
    Object.assign(this, { localPort, gatewayUrl, ticket, onError, server: null });
    this.clients = new Set();
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.bridge(socket));
      this.server.once('error', reject);
      this.server.listen(this.localPort, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  bridge(socket) {
    const ws = new WebSocket(this.gatewayUrl);
    const client = { socket, ws };
    this.clients.add(client);
    let ready = false;
    const pending = [];
    const close = () => {
      this.clients.delete(client);
      if (!socket.destroyed) socket.destroy();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'tcp_auth', ticket: this.ticket })));
    ws.on('message', (raw, isBinary) => {
      if (!isBinary) {
        try {
          ready = JSON.parse(raw.toString()).type === 'tcp_ready';
          if (ready) pending.splice(0).forEach((chunk) => ws.send(chunk, { binary: true }));
        } catch (_) { /* closed by gateway */ }
        return;
      }
      if (!socket.destroyed) socket.write(raw);
    });
    ws.on('close', () => { if (!socket.destroyed) socket.end(); });
    ws.on('error', (error) => { if (!ready && this.onError) this.onError(error); close(); });
    socket.on('data', (chunk) => {
      if (ws.readyState === WebSocket.OPEN && ready) ws.send(chunk, { binary: true });
      else pending.push(chunk);
    });
    socket.once('close', close);
    socket.once('error', close);
  }

  close() {
    for (const { socket, ws } of this.clients) { if (!socket.destroyed) socket.destroy(); ws.close(); }
    this.clients.clear();
    return new Promise((resolve) => this.server ? this.server.close(resolve) : resolve());
  }
}

module.exports = { PrivateTcpConnection };
