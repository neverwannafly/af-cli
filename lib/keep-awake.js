const { spawn } = require('child_process');

// Prevents idle sleep while a long-running tunnel command is active.
// macOS: caffeinate (-w ties its lifetime to this process, even on SIGKILL).
// Linux: systemd-inhibit holding a sleep inhibitor until this process dies.
// Anything else, or a missing binary, is a silent no-op.
function commandFor(pid, platform = process.platform) {
  if (platform === 'darwin') {
    return { file: 'caffeinate', args: ['-i', '-w', String(pid)] };
  }
  if (platform === 'linux') {
    return {
      file: 'systemd-inhibit',
      args: [
        '--what=idle:sleep', '--who=af-cli', '--why=Tunnel is open', '--mode=block',
        'sh', '-c', `while kill -0 ${pid} 2>/dev/null; do sleep 5; done`,
      ],
    };
  }
  return null;
}

function startKeepAwake({ enabled = true, platform = process.platform, spawnFn = spawn } = {}) {
  if (!enabled) return { active: false, stop() {} };
  const command = commandFor(process.pid, platform);
  if (!command) return { active: false, stop() {} };

  let child;
  const handle = { active: true, stop() { handle.active = false; if (child) child.kill(); } };
  try {
    child = spawnFn(command.file, command.args, { stdio: 'ignore' });
  } catch {
    return { active: false, stop() {} };
  }
  child.on('error', () => { handle.active = false; });
  child.on('exit', () => { handle.active = false; });
  child.unref();
  process.once('exit', () => handle.stop());
  return handle;
}

module.exports = { startKeepAwake, commandFor };
