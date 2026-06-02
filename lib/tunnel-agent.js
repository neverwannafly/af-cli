const http = require('http');
const { URL } = require('url');
const WebSocket = require('ws');
const packageJson = require('../package.json');

const PROTOCOL_VERSION = 1;
const LOCAL_HOST = '127.0.0.1';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
]);

function toBase64(chunk) {
  return Buffer.from(chunk).toString('base64');
}

function fromBase64(data) {
  return Buffer.from(data || '', 'base64');
}

function sendJson(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function filteredHeaders(headers = {}) {
  const nextHeaders = {};

  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerName)) {
      continue;
    }
    nextHeaders[name] = value;
  }

  return nextHeaders;
}

function buildLocalHttpOptions(localPort, message) {
  const headers = filteredHeaders(message.headers);
  headers.host = headers.host || `${LOCAL_HOST}:${localPort}`;

  return {
    hostname: LOCAL_HOST,
    port: localPort,
    method: message.method,
    path: message.path || '/',
    headers,
  };
}

function buildLocalWebSocketUrl(localPort, path) {
  const localUrl = new URL(path || '/', `ws://${LOCAL_HOST}:${localPort}`);
  return localUrl.toString();
}

function methodUsuallyHasNoBody(method) {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(String(method || '').toUpperCase());
}

class TunnelAgent {
  constructor({ connectUrl, agentToken, slug, hostname, localPort, onClose, onLog }) {
    this.connectUrl = connectUrl;
    this.agentToken = agentToken;
    this.slug = slug;
    this.hostname = hostname;
    this.localPort = localPort;
    this.socket = null;
    this.httpStreams = new Map();
    this.wsStreams = new Map();
    this.closed = false;
    this.onClose = onClose;
    this.onLog = onLog;
  }

  start() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(this.buildConnectUrl(), {
        headers: {
          Authorization: `Bearer ${this.agentToken}`,
          'X-Agent-Token': this.agentToken,
          'X-Tunnel-Token': this.agentToken,
          'X-Tunnel-Slug': this.slug || '',
        },
      });

      this.socket = socket;

      socket.once('open', () => {
        sendJson(socket, {
          type: 'hello',
          protocol_version: PROTOCOL_VERSION,
          agent_version: packageJson.version,
          slug: this.slug,
        });
        setTimeout(() => {
          if (!settled && socket.readyState === WebSocket.OPEN) {
            settled = true;
            resolve();
          }
        }, 500);
      });

      socket.once('error', (error) => {
        if (!settled) {
          settled = true;
          reject(error);
          return;
        }
        if (!this.closed && this.onClose) this.onClose(error);
      });
      socket.on('message', (data) => this.handleMessage(data));
      socket.on('close', (code, reason) => {
        this.closeStreams();
        const reasonText = reason?.toString() || 'connection closed';
        if (!settled) {
          settled = true;
          reject(new Error(`Tunnel agent connection closed during startup (${code}: ${reasonText})`));
          return;
        }
        if (!this.closed && this.onClose) {
          this.onClose(new Error(`Tunnel agent connection closed (${code}: ${reasonText})`));
        }
      });
    });
  }

  buildConnectUrl() {
    const url = new URL(this.connectUrl);
    if (this.slug) url.searchParams.set('slug', this.slug);
    if (this.hostname) url.searchParams.set('hostname', this.hostname);
    return url.toString();
  }

  close() {
    this.closed = true;
    this.closeStreams();

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'agent shutdown');
    }
  }

  handleMessage(data) {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    switch (message.type) {
      case 'http_request_start':
        this.startHttpStream(message);
        break;
      case 'http_request_body':
        this.writeHttpBody(message);
        break;
      case 'ws_open':
        this.openWebSocketStream(message);
        break;
      case 'ws_frame':
        this.writeWebSocketFrame(message);
        break;
      case 'stream_close':
        this.closeStream(message.stream_id, message.code, message.reason);
        break;
      case 'ping':
        sendJson(this.socket, { type: 'pong', ts: message.ts || Date.now() });
        break;
      default:
        break;
    }
  }

  startHttpStream(message) {
    const streamId = message.stream_id;
    const startedAt = Date.now();
    const requestInfo = {
      type: 'HTTP',
      method: message.method || 'GET',
      path: message.path || '/',
      requestBytes: 0,
      responseBytes: 0,
      status: null,
    };
    const request = http.request(buildLocalHttpOptions(this.localPort, message), (response) => {
      requestInfo.status = response.statusCode || 502;
      sendJson(this.socket, {
        type: 'http_response_start',
        stream_id: streamId,
        status: response.statusCode || 502,
        headers: response.headers,
      });

      response.on('data', (chunk) => {
        requestInfo.responseBytes += chunk.length;
        sendJson(this.socket, {
          type: 'http_response_body',
          stream_id: streamId,
          data_base64: toBase64(chunk),
          end: false,
        });
      });

      response.on('end', () => {
        sendJson(this.socket, {
          type: 'http_response_body',
          stream_id: streamId,
          data_base64: '',
          end: true,
        });
        this.httpStreams.delete(streamId);
        this.emitLog({
          ...requestInfo,
          durationMs: Date.now() - startedAt,
        });
      });
    });

    request.on('error', (error) => {
      requestInfo.status = 502;
      sendJson(this.socket, {
        type: 'http_response_start',
        stream_id: streamId,
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
      sendJson(this.socket, {
        type: 'http_response_body',
        stream_id: streamId,
        data_base64: toBase64(`Local tunnel target error: ${error.message}\n`),
        end: true,
      });
      this.httpStreams.delete(streamId);
      this.emitLog({
        ...requestInfo,
        durationMs: Date.now() - startedAt,
        note: error.message,
      });
    });

    this.httpStreams.set(streamId, { request, info: requestInfo, startedAt });

    if (message.end === true || methodUsuallyHasNoBody(message.method)) {
      request.end();
    }
  }

  writeHttpBody(message) {
    const stream = this.httpStreams.get(message.stream_id);
    if (!stream) {
      return;
    }

    const body = fromBase64(message.data_base64);
    if (body.length > 0) {
      stream.info.requestBytes += body.length;
      stream.request.write(body);
    }

    if (message.end) {
      stream.request.end();
    }
  }

  openWebSocketStream(message) {
    const streamId = message.stream_id;
    const queuedFrames = [];
    const localSocket = new WebSocket(buildLocalWebSocketUrl(this.localPort, message.path), {
      headers: filteredHeaders(message.headers),
    });
    const startedAt = Date.now();

    this.wsStreams.set(streamId, { socket: localSocket, queuedFrames });

    localSocket.on('open', () => {
      this.emitLog({
        type: 'WS',
        method: 'OPEN',
        path: message.path || '/',
        status: 101,
        durationMs: Date.now() - startedAt,
        note: 'connected',
      });
      while (queuedFrames.length > 0 && localSocket.readyState === WebSocket.OPEN) {
        const frame = queuedFrames.shift();
        localSocket.send(frame.data, { binary: frame.binary });
      }
    });

    localSocket.on('message', (data, binary) => {
      sendJson(this.socket, {
        type: 'ws_frame',
        stream_id: streamId,
        data_base64: toBase64(data),
        binary,
      });
    });

    localSocket.on('close', (code, reason) => {
      sendJson(this.socket, {
        type: 'stream_close',
        stream_id: streamId,
        code,
        reason: reason.toString(),
      });
      this.wsStreams.delete(streamId);
      this.emitLog({
        type: 'WS',
        method: 'CLOSE',
        path: message.path || '/',
        status: code,
        note: reason.toString() || 'closed',
      });
    });

    localSocket.on('error', (error) => {
      sendJson(this.socket, {
        type: 'stream_close',
        stream_id: streamId,
        code: 1011,
        reason: error.message,
      });
      this.wsStreams.delete(streamId);
      this.emitLog({
        type: 'WS',
        method: 'ERROR',
        path: message.path || '/',
        status: 1011,
        durationMs: Date.now() - startedAt,
        note: error.message,
      });
    });
  }

  writeWebSocketFrame(message) {
    const stream = this.wsStreams.get(message.stream_id);
    if (!stream) {
      return;
    }

    const frame = {
      data: fromBase64(message.data_base64),
      binary: Boolean(message.binary),
    };

    if (stream.socket.readyState === WebSocket.OPEN) {
      stream.socket.send(frame.data, { binary: frame.binary });
      return;
    }

    if (stream.socket.readyState === WebSocket.CONNECTING) {
      stream.queuedFrames.push(frame);
    }
  }

  closeStream(streamId, code = 1000, reason = 'closed') {
    const httpStream = this.httpStreams.get(streamId);
    if (httpStream) {
      httpStream.request.destroy();
      this.httpStreams.delete(streamId);
      this.emitLog({
        ...httpStream.info,
        status: httpStream.info.status || 499,
        durationMs: Date.now() - httpStream.startedAt,
        note: reason,
      });
    }

    const wsStream = this.wsStreams.get(streamId);
    if (wsStream) {
      wsStream.socket.close(code, reason);
      this.wsStreams.delete(streamId);
    }
  }

  closeStreams() {
    for (const streamId of this.httpStreams.keys()) {
      this.closeStream(streamId);
    }

    for (const streamId of this.wsStreams.keys()) {
      this.closeStream(streamId);
    }
  }

  emitLog(entry) {
    if (this.onLog) this.onLog(entry);
  }
}

module.exports = {
  TunnelAgent,
};
