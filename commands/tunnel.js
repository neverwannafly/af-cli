const { spawn } = require('child_process');
const { Command } = require('commander');
const chalk = require('chalk');

function tunnelCommand(program) {
  program
    .command('tunnel <url>')
    .description('Start a tunnel using wstunnel')
    .requiredOption('-l, --local-port <port>', 'Local port to bind to', '5432')
    .option('--remote-host <host>', 'Remote database host', 'localhost')
    .option('--remote-port <port>', 'Remote database port', '5432')
    .action((url, options) => {
      startTunnel(url, options);
    });
}

function startTunnel(url, options) {
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

