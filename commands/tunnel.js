const { spawn } = require('child_process');
const chalk = require('chalk');
const { ApiClient } = require('../lib/api-client');
const { DEFAULT_TUNNEL_VISIBILITY, configPath, readConfig } = require('../lib/config');
const { TunnelAgent } = require('../lib/tunnel-agent');
const { TunnelDashboard } = require('../lib/tunnel-dashboard');

function tunnelCommand(program) {
  const tunnel = program
    .command('tunnel [url]')
    .description('Manage tunnels')
    .action((url, options, command) => {
      if (!url) {
        command.help();
        return;
      }

      console.log(chalk.yellow('[DEPRECATED]'), 'Use `af-cli tunnel connect <url>` for legacy wstunnel connections.');
      startLegacyTunnel(url, command.opts());
    });

  addLegacyOptions(tunnel);

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

  const connect = tunnel
    .command('connect <url>')
    .description('Deprecated: start a legacy tunnel using wstunnel')
    .action((url, options) => {
      console.log(chalk.yellow('[DEPRECATED]'), '`af-cli tunnel connect` uses the legacy wstunnel flow.');
      startLegacyTunnel(url, options);
    });

  addLegacyOptions(connect);
}

function addLegacyOptions(command) {
  command
    .requiredOption('-l, --local-port <port>', 'Local port to bind to', '5432')
    .option('--remote-host <host>', 'Remote database host', 'localhost')
    .option('--remote-port <port>', 'Remote database port', '5432');
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

function startLegacyTunnel(url, options) {
  const { localPort, remoteHost, remotePort } = options;

  // Convert http:// to ws:// and https:// to wss://
  let wsUrl = url;
  if (url.startsWith('http://')) {
    wsUrl = 'ws://' + url.substring(7);
  } else if (url.startsWith('https://')) {
    wsUrl = 'wss://' + url.substring(8);
  }

  console.log(chalk.green('[OK]'), 'Setting up tunnel...');
  console.log(chalk.cyan('[->]'), `WebSocket Server: ${url}`);
  console.log(chalk.cyan('[->]'), `Local Port: ${localPort}`);
  console.log(chalk.cyan('[->]'), `Remote Target: ${remoteHost}:${remotePort}`);
  console.log();

  // Check if wstunnel is installed
  const checkWstunnel = spawn('which', ['wstunnel']);
  
  checkWstunnel.on('close', (code) => {
    if (code !== 0) {
      console.error(chalk.red('[ERROR]'), 'wstunnel is not installed');
      console.log(chalk.yellow('[INFO]'), 'Install wstunnel:');
      console.log('  Linux: wget https://github.com/erebe/wstunnel/releases/latest/download/wstunnel-linux-amd64');
      console.log('  macOS: brew install wstunnel');
      process.exit(1);
    }

    // Start wstunnel
    const args = [
      'client',
      '-L',
      `tcp://127.0.0.1:${localPort}:${remoteHost}:${remotePort}`,
      wsUrl
    ];

    console.log(chalk.yellow('[!]'), 'Starting wstunnel...');
    console.log(chalk.cyan('[->]'), `Command: wstunnel ${args.join(' ')}`);
    console.log();

    const tunnel = spawn('wstunnel', args, {
      stdio: 'inherit'
    });

    // Handle tunnel process
    tunnel.on('error', (err) => {
      console.error(chalk.red('[ERROR]'), 'Failed to start wstunnel:', err.message);
      process.exit(1);
    });

    tunnel.on('close', (code) => {
      if (code !== 0) {
        console.log(chalk.red('[ERROR]'), `wstunnel exited with code ${code}`);
        process.exit(code);
      }
      console.log(chalk.green('[OK]'), 'Tunnel closed');
    });

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log();
      console.log(chalk.yellow('[!]'), 'Shutting down tunnel...');
      tunnel.kill('SIGTERM');
      
      setTimeout(() => {
        tunnel.kill('SIGKILL');
        process.exit(0);
      }, 1000);
    });

    process.on('SIGTERM', () => {
      tunnel.kill('SIGTERM');
      setTimeout(() => {
        tunnel.kill('SIGKILL');
        process.exit(0);
      }, 1000);
    });

    // Give it a moment to start
    setTimeout(() => {
      console.log(chalk.green('[OK]'), 'Tunnel established!');
      console.log(chalk.cyan('[->]'), `Local endpoint: localhost:${localPort}`);
      console.log(chalk.cyan('[->]'), 'Press Ctrl+C to close tunnel');
      console.log();
    }, 2000);
  });
}

module.exports = { tunnelCommand };
