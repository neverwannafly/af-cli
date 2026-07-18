const fs = require('fs');
const path = require('path');

// node-pty's macOS prebuilt archive can lose the executable bit on spawn-helper.
// Without it every PTY launch fails with the opaque "posix_spawnp failed" error.
if (process.platform !== 'darwin') process.exit(0);

const helperPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'node-pty',
  'prebuilds',
  `${process.platform}-${process.arch}`,
  'spawn-helper',
);

if (!fs.existsSync(helperPath)) process.exit(0);

try {
  fs.accessSync(helperPath, fs.constants.X_OK);
} catch {
  fs.chmodSync(helperPath, 0o755);
  console.log('Fixed executable permission for node-pty spawn-helper');
}
