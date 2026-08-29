const { URL } = require('url');
const WebSocket = require('ws');
const packageJson = require('../package.json');

const PROTOCOL_VERSION = 1;
const MAX_SCROLLBACK_BYTES = 256 * 1024;

function sendJson(socket, message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function encode(data) {
  return Buffer.from(data).toString('base64');
}

function decode(data) {
  return Buffer.from(data || '', 'base64');
}

// Terminal "report" queries an app writes to the PTY expecting the emulator to
// answer (Device Attributes, cursor position, DECRQM, OSC color, …). They are
// invisible control sequences, so removing them from *replayed history* has no
// visual effect. We must strip them because a freshly opened browser terminal
// re-parses the scrollback and would answer these long-dead queries; the belated
// replies then land as input on the idle shell prompt and print as garbage
// (`2026;0$y…`, `rgb:0707/0c0c/1717`, `command not found: 2c11`). Live PTY output
// is never passed through here, so interactive apps (vim, tmux) still get answers.
function stripTerminalReportQueries(buffer) {
  const text = buffer.toString('latin1')
    // Device Attributes: ESC [ [<|=|>] … c   (primary/secondary/tertiary)
    .replace(/\x1b\[[0-9;?>=]*c/g, '')
    // Device Status Report / cursor-position request: ESC [ [?] … n
    .replace(/\x1b\[\??[0-9;]*n/g, '')
    // DECRQM (request DEC private mode): ESC [ ? … $ p
    .replace(/\x1b\[\?[0-9;]*\$p/g, '')
    // DECRQSS (request selection/setting): ESC P $ q … ST
    .replace(/\x1bP\$q[\s\S]*?\x1b\\/g, '')
    // XTVERSION and similar requests: ESC [ > … q
    .replace(/\x1b\[>[0-9;]*q/g, '')
    // OSC color *queries* only (payload is `?`): ESC ] (4;N | 10 | 11 | 12 …) ; ? BEL|ST
    .replace(/\x1b\](?:4;[0-9]+|[0-9]+);\?(?:\x07|\x1b\\)/g, '');
  return Buffer.from(text, 'latin1');
}

function resolveShell() {
  if (process.platform === 'win32') {
    return { file: process.env.COMSPEC || 'cmd.exe', args: [] };
  }

  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  // POSIX shells conventionally use -l for a login shell, which makes the
  // remote terminal behave like the terminal the user normally opens.
  return { file: shell, args: ['-l'] };
}

function loadPty() {
  try {
    // Keep this lazy so `af-cli` commands unrelated to remote terminals do
    // not load a native addon.
    return require('node-pty'); // eslint-disable-line global-require
  } catch (error) {
    throw new Error(`Remote Terminal needs the node-pty native dependency: ${error.message}`);
  }
}

class RemoteTerminalConnection {
  constructor({ connectUrl, agentToken, slug, onMessage, onClose }) {
    this.connectUrl = connectUrl;
    this.agentToken = agentToken;
    this.slug = slug;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.socket = null;
    this.closed = false;
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
          capabilities: ['remote_terminal'],
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
        } else if (!this.closed && this.onClose) {
          this.onClose(error);
        }
      });
      socket.on('message', (data) => this.onMessage(data));
      socket.on('close', (code, reason) => {
        const reasonText = reason?.toString() || 'connection closed';
        if (!settled) {
          settled = true;
          reject(new Error(`Remote terminal agent connection closed during startup (${code}: ${reasonText})`));
        } else if (!this.closed && this.onClose) {
          this.onClose(new Error(`Remote terminal agent connection closed (${code}: ${reasonText})`));
        }
      });
    });
  }

  buildConnectUrl() {
    const url = new URL(this.connectUrl);
    if (this.slug) url.searchParams.set('slug', this.slug);
    url.searchParams.set('capability', 'remote_terminal');
    return url.toString();
  }

  send(message) {
    sendJson(this.socket, message);
  }

  close() {
    this.closed = true;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'agent shutdown');
    }
  }
}

class RemoteTerminalAgent {
  constructor({ cwd, onTerminalExit }) {
    this.cwd = cwd || process.cwd();
    this.onTerminalExit = onTerminalExit;
    this.connection = null;
    this.pty = null;
    this.attachmentId = null;
    this.scrollback = Buffer.alloc(0);
    this.closed = false;
  }

  start() {
    this.startPty();
  }

  bindConnection(connection) {
    this.connection = connection;
  }

  startPty() {
    const pty = loadPty();
    const shell = resolveShell();
    this.pty = pty.spawn(shell.file, shell.args, {
      name: process.env.TERM || 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.cwd,
      env: { ...process.env, TERM: process.env.TERM || 'xterm-256color' },
    });
    this.pty.onData((data) => this.handlePtyData(data));
    this.pty.onExit(({ exitCode, signal }) => {
      if (this.closed) return;
      if (this.onTerminalExit) this.onTerminalExit({ exitCode, signal });
    });
  }

  handlePtyData(data) {
    const bytes = Buffer.from(data);
    this.scrollback = Buffer.concat([this.scrollback, bytes]);
    if (this.scrollback.length > MAX_SCROLLBACK_BYTES) {
      this.scrollback = this.scrollback.subarray(this.scrollback.length - MAX_SCROLLBACK_BYTES);
    }

    if (this.attachmentId && this.connection) {
      this.connection.send({
        type: 'terminal_output',
        attachment_id: this.attachmentId,
        data_base64: encode(bytes),
      });
    }
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (_) {
      return;
    }

    switch (message.type) {
      case 'terminal_attach':
        this.attach(message.attachment_id || message.session_id, message.cols, message.rows);
        break;
      case 'terminal_input':
        if (this.attachmentId && message.attachment_id === this.attachmentId) {
          this.pty.write(decode(message.data_base64).toString('utf8'));
        }
        break;
      case 'terminal_resize':
        if (this.attachmentId && message.attachment_id === this.attachmentId) {
          this.resize(message.cols, message.rows);
        }
        break;
      case 'terminal_detach':
        if (!message.attachment_id || message.attachment_id === this.attachmentId) {
          this.detach(message.reason || 'browser detached');
        }
        break;
      case 'ping':
        if (this.connection) {
          this.connection.send({ type: 'pong', ts: message.ts || Date.now() });
        }
        break;
      default:
        break;
    }
  }

  attach(attachmentId, cols, rows) {
    if (!attachmentId) return;
    if (this.attachmentId && this.attachmentId !== attachmentId && this.connection) {
      this.connection.send({
        type: 'terminal_detached',
        attachment_id: this.attachmentId,
        reason: 'taken over by another browser session',
      });
    }
    this.attachmentId = attachmentId;
    this.resize(cols, rows);
    if (this.scrollback.length > 0 && this.connection) {
      this.connection.send({
        type: 'terminal_output',
        attachment_id: attachmentId,
        data_base64: encode(stripTerminalReportQueries(this.scrollback)),
        replay: true,
      });
    }
  }

  detach(reason) {
    if (!this.attachmentId) return;
    if (this.connection) {
      this.connection.send({ type: 'terminal_detached', attachment_id: this.attachmentId, reason });
    }
    this.attachmentId = null;
  }

  resize(cols, rows) {
    const width = Number.parseInt(cols, 10);
    const height = Number.parseInt(rows, 10);
    if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) {
      this.pty.resize(width, height);
    }
  }

  close() {
    this.closed = true;
    this.detach('agent shutdown');
    if (this.connection) this.connection.close();
    if (this.pty) this.pty.kill();
  }
}

module.exports = { RemoteTerminalAgent, RemoteTerminalConnection, resolveShell };
