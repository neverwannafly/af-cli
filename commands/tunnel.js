const chalk = require('chalk');
const { ApiClient } = require('../lib/api-client');
const { DEFAULT_TUNNEL_VISIBILITY, configPath, readConfig } = require('../lib/config');
const { TunnelAgent } = require('../lib/tunnel-agent');
const { TunnelDashboard } = require('../lib/tunnel-dashboard');
const { RemoteTerminalAgent } = require('../lib/remote-terminal-agent');
const { PrivateTcpConnection } = require('../lib/private-tcp-connection');

function tunnelCommand(program) {
  const tunnel = program.command('tunnel').description('Manage tunnels').action((_options, command) => command.help());

  tunnel
    .command('http <port>')
    .description('Publish a local HTTP server through API Frenzy')
    .requiredOption('--name <name>', 'Tunnel name')
    .option('--api-base-url <url>', 'API Frenzy API base URL')
    .option('--session-token <token>', 'API Frenzy session token')
    .option('--visibility <visibility>', 'Tunnel visibility')
    .action((port, options) => {
      startHttpTunnel(port, options).catch((error) => {
        console.error(chalk.red('[ERROR]'), error.message);
        process.exit(1);
      });
    });

  tunnel
    .command('remote')
    .description('Open a private browser terminal to this machine')
    .requiredOption('--name <name>', 'Remote terminal name')
    .option('--api-base-url <url>', 'API Frenzy API base URL')
    .option('--session-token <token>', 'API Frenzy session token')
    .action((options) => {
      startRemoteTerminal(options).catch((error) => {
        console.error(chalk.red('[ERROR]'), error.message);
        process.exit(1);
      });
    });

  tunnel.command('connect <deployment>')
    .description('Connect an approved private TCP service on localhost')
    .showHelpAfterError()
    .option('--local-port <port>', 'Loopback port override for your native client')
    .option('--api-base-url <url>', 'API Frenzy API base URL')
    .option('--session-token <token>', 'API Frenzy session token')
    .action((deployment, options) => startPrivateConnection(deployment, options).catch((error) => {
      console.error(chalk.red('[ERROR]'), error.message);
      process.exit(1);
    }));
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

  console.log(chalk.green('[OK]'), 'Creating tunnel...');

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
  const agent = new TunnelAgent({
    connectUrl: tunnelData.agentConnectUrl,
    agentToken: tunnelData.agentToken,
    slug: tunnelData.slug,
    hostname: tunnelData.hostname,
    localPort,
    onClose: (error) => {
      dashboard.stop();
      console.error();
      console.error(chalk.red('[ERROR]'), error.message);
      process.exit(1);
    },
    onLog: (entry) => dashboard.add(entry),
  });

  await agent.start();

  dashboard.start();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log();
    console.log(chalk.yellow('[!]'), 'Stopping tunnel...');
    dashboard.stop();
    agent.close();

    try {
      await apiClient.disconnectTunnel(tunnelData.slug);
    } catch (error) {
      console.error(chalk.yellow('[WARN]'), error.message);
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

  console.log(chalk.green('[OK]'), 'Creating remote terminal tunnel...');
  const terminal = normalizeRemoteTerminalData(await apiClient.createTunnel({
    name: options.name,
    kind: 'remote_terminal',
  }));
  if (!terminal.agentConnectUrl || !terminal.agentToken) {
    throw new Error('Remote Terminal API response did not include agent_connect_url and agent_token');
  }

  let shuttingDown = false;
  const shutdown = async (message = 'Stopping remote terminal...') => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log();
    console.log(chalk.yellow('[!]'), message);
    agent.close();
    process.exit(0);
  };

  const agent = new RemoteTerminalAgent({
    connectUrl: terminal.agentConnectUrl,
    agentToken: terminal.agentToken,
    slug: terminal.slug,
    cwd: process.cwd(),
    onClose: (error) => {
      console.error();
      console.error(chalk.red('[ERROR]'), error.message);
      shutdown('Remote terminal disconnected...');
    },
    onTerminalExit: () => shutdown('Login shell exited; stopping remote terminal...'),
  });

  try {
    await agent.start();
  } catch (error) {
    agent.close();
    throw error;
  }
  console.log(chalk.green('[OK]'), 'Remote terminal is ready in your API Frenzy dashboard.');
  console.log(chalk.cyan('[->]'), 'The shell runs as your current OS user. Press Ctrl+C here to stop it.');

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
}

async function startPrivateConnection(deployment, options) {
  const config = readConfig();
  const apiClient = new ApiClient({ apiBaseUrl: options.apiBaseUrl, sessionToken: options.sessionToken });
  if (!apiClient.hasSessionToken()) throw new Error(`No session token found. Run af-cli login. Config path: ${configPath()}`);

  console.log(chalk.green('[OK]'), `Authorizing private connection to ${deployment}...`);
  const authorization = await apiClient.createPrivateConnectionTicket(deployment);
  if (!authorization.ticket || !authorization.gateway_connect_url) throw new Error('API did not return a private connection credential');
  const suggestedPort = authorization.profile?.local_port || authorization.profile?.port;
  if (!options.localPort && !suggestedPort) {
    throw new Error('API did not return a default local port for this private connection');
  }
  const localPort = parsePort(options.localPort || suggestedPort);
  const bridge = new PrivateTcpConnection({ localPort, gatewayUrl: authorization.gateway_connect_url, ticket: authorization.ticket,
    onError: (error) => console.error(chalk.red('[ERROR]'), `Connection failed: ${error.message}`) });
  await bridge.start();
  console.log(chalk.green('[OK]'), `Private TCP connection listening on 127.0.0.1:${localPort}`);
  console.log(chalk.cyan('[->]'), 'Use your native client against localhost. Press Ctrl+C to stop.');
  let stopping = false;
  const stop = async () => { if (!stopping) { stopping = true; await bridge.close(); process.exit(0); } };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { tunnelCommand };
