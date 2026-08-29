const { ApiClient } = require('../lib/api-client');
const { DEFAULT_TUNNEL_VISIBILITY, configPath, readConfig } = require('../lib/config');
const { TunnelAgent } = require('../lib/tunnel-agent');
const { TunnelDashboard } = require('../lib/tunnel-dashboard');
const { TunnelReconnector } = require('../lib/tunnel-reconnector');
const { RemoteTerminalAgent, RemoteTerminalConnection } = require('../lib/remote-terminal-agent');
const { PrivateTcpConnection } = require('../lib/private-tcp-connection');
const output = require('../lib/output');
const { AfError } = require('../lib/errors');

function requireInteractiveOutput() {
  if (output.currentFormat() !== 'table') {
    throw new AfError('Tunnel commands are interactive and require table output', { code: 'validation_failed' });
  }
}

function tunnelCommand(program) {
  const tunnel = program.command('tunnel').description('Manage tunnels').action((_options, command) => command.help());

  tunnel
    .command('http <port>')
    .description('Publish a local HTTP server through API Frenzy')
    .requiredOption('--name <name>', 'Tunnel name')
    .option('--api-base-url <url>', 'API Frenzy API base URL')
    .option('--session-token <token>', 'API Frenzy session token')
    .option('--visibility <visibility>', 'Tunnel visibility')
    .action(async (port, options) => {
      requireInteractiveOutput();
      await startHttpTunnel(port, options);
    });

  tunnel
    .command('remote')
    .description('Open a private browser terminal to this machine')
    .requiredOption('--name <name>', 'Remote terminal name')
    .option('--api-base-url <url>', 'API Frenzy API base URL')
    .option('--session-token <token>', 'API Frenzy session token')
    .action(async (options) => {
      requireInteractiveOutput();
      await startRemoteTerminal(options);
    });

  tunnel.command('connect <deployment>')
    .description('Connect an approved private TCP service on localhost')
    .showHelpAfterError()
    .option('--local-port <port>', 'Loopback port override for your native client')
    .option('--api-base-url <url>', 'API Frenzy API base URL')
    .option('--session-token <token>', 'API Frenzy session token')
    .action(async (deployment, options) => {
      requireInteractiveOutput();
      await startPrivateConnection(deployment, options);
    });
}

function parsePort(port) {
  const parsed = Number.parseInt(port, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }

  return parsed;
}

function normalizeTunnelData(data) {
  return {
    slug: data.slug || data.id,
    hostname: data.hostname,
    publicUrl: data.public_url || data.publicUrl,
    agentConnectUrl: data.agent_connect_url || data.agentConnectUrl,
    agentToken: data.agent_token || data.agentToken,
  };
}

async function startHttpTunnel(port, options) {
  const localPort = parsePort(port);
  const config = readConfig();
  const apiClient = new ApiClient({
    apiBaseUrl: options.apiBaseUrl,
    sessionToken: options.sessionToken,
  });

  if (!apiClient.hasSessionToken()) {
    throw new Error(`No session token found. Run af-cli login when available, or set AF_SESSION_TOKEN. Config path: ${configPath()}`);
  }

  output.note('Creating tunnel...');

  const tunnelData = normalizeTunnelData(await apiClient.createTunnel({
    name: options.name,
    localPort,
    visibility: options.visibility || config.defaultTunnelVisibility || DEFAULT_TUNNEL_VISIBILITY,
  }));

  if (!tunnelData.agentConnectUrl || !tunnelData.agentToken) {
    throw new Error('Tunnel API response did not include agent_connect_url and agent_token');
  }

  const dashboard = new TunnelDashboard({
    publicUrl: tunnelData.publicUrl || tunnelData.slug,
    localPort,
  });
  dashboard.start();
  const reconnector = new TunnelReconnector({
    createAgent: ({ onClose }) => new TunnelAgent({
      connectUrl: tunnelData.agentConnectUrl,
      agentToken: tunnelData.agentToken,
      slug: tunnelData.slug,
      hostname: tunnelData.hostname,
      localPort,
      onClose,
      onLog: (entry) => dashboard.add(entry),
    }),
    onStatus: ({ state, attempt, delayMs, error }) => {
      if (state === 'connected') return;

      const message = state === 'reconnected'
        ? 'Tunnel reconnected.'
        : `Tunnel disconnected (${error?.message || 'unknown error'}). Retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt})...`;
      dashboard.add({
        type: 'SYS',
        method: state === 'reconnected' ? 'READY' : 'RETRY',
        path: '/',
        status: state === 'reconnected' ? 200 : 503,
        note: message,
      });
      if (!process.stdout.isTTY) output.note(message);
    },
  });

  await reconnector.start();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    output.note('');
    output.note('Stopping tunnel...');
    dashboard.stop();
    reconnector.stop();

    try {
      await apiClient.disconnectTunnel(tunnelData.slug);
    } catch (error) {
      output.warn(error.message);
    }

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function normalizeRemoteTerminalData(data) {
  return {
    slug: data.slug || data.id,
    agentConnectUrl: data.agent_connect_url || data.agentConnectUrl,
    agentToken: data.agent_token || data.agentToken,
  };
}

async function startRemoteTerminal(options) {
  const config = readConfig();
  const apiClient = new ApiClient({ apiBaseUrl: options.apiBaseUrl, sessionToken: options.sessionToken });
  if (!apiClient.hasSessionToken()) {
    throw new Error(`No session token found. Run af-cli login when available, or set AF_SESSION_TOKEN. Config path: ${configPath()}`);
  }

  output.note('Creating remote terminal tunnel...');
  const terminal = normalizeRemoteTerminalData(await apiClient.createTunnel({
    name: options.name,
    kind: 'remote_terminal',
  }));
  if (!terminal.agentConnectUrl || !terminal.agentToken) {
    throw new Error('Remote Terminal API response did not include agent_connect_url and agent_token');
  }

  let shuttingDown = false;
  let reconnector;
  const shutdown = async (message = 'Stopping remote terminal...') => {
    if (shuttingDown) return;
    shuttingDown = true;
    output.note('');
    output.note(message);
    if (reconnector) reconnector.stop();
    if (agent) agent.close();
    process.exit(0);
  };

  const agent = new RemoteTerminalAgent({
    cwd: process.cwd(),
    onTerminalExit: () => shutdown('Login shell exited; stopping remote terminal...'),
  });

  agent.start();

  reconnector = new TunnelReconnector({
    createAgent: ({ onClose }) => {
      const connection = new RemoteTerminalConnection({
        connectUrl: terminal.agentConnectUrl,
        agentToken: terminal.agentToken,
        slug: terminal.slug,
        onMessage: (data) => agent.handleMessage(data),
        onClose: onClose
      });
      agent.bindConnection(connection);
      return connection;
    },
    onStatus: ({ state, attempt, delayMs, error }) => {
      if (state === 'connected') return;
      const message = state === 'reconnected'
        ? 'Tunnel reconnected.'
        : `Tunnel disconnected (${error?.message || 'unknown error'}). Retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt})...`;
      output.note(message);
    }
  });

  try {
    await reconnector.start();
  } catch (error) {
    agent.close();
    throw error;
  }
  
  output.note('Remote terminal is ready in your API Frenzy dashboard.');
  output.note('The shell runs as your current OS user. Press Ctrl+C here to stop it.');

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
}

async function startPrivateConnection(deployment, options) {
  const config = readConfig();
  const apiClient = new ApiClient({ apiBaseUrl: options.apiBaseUrl, sessionToken: options.sessionToken });
  if (!apiClient.hasSessionToken()) throw new Error(`No session token found. Run af-cli login. Config path: ${configPath()}`);

  output.note(`Authorizing private connection to ${deployment}...`);
  const authorization = await apiClient.createPrivateConnectionTicket(deployment);
  if (!authorization.ticket || !authorization.gateway_connect_url) throw new Error('API did not return a private connection credential');
  const suggestedPort = authorization.profile?.local_port || authorization.profile?.port;
  if (!options.localPort && !suggestedPort) {
    throw new Error('API did not return a default local port for this private connection');
  }
  const localPort = parsePort(options.localPort || suggestedPort);
  const bridge = new PrivateTcpConnection({ localPort, gatewayUrl: authorization.gateway_connect_url, ticket: authorization.ticket,
    onError: (error) => output.warn(`Connection failed: ${error.message}`) });
  await bridge.start();
  output.note(`Private TCP connection listening on 127.0.0.1:${localPort}`);
  output.note('Use your native client against localhost. Press Ctrl+C to stop.');
  let stopping = false;
  const stop = async () => { if (!stopping) { stopping = true; await bridge.close(); process.exit(0); } };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { tunnelCommand };
