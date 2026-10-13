const fs = require('fs');
const path = require('path');

// node-pty's macOS prebuilt archive can lose the executable bit on spawn-helper.
// Without it every PTY launch fails with the opaque "posix_spawnp failed" error.
function helperPaths() {
  if (process.platform !== 'darwin') return [];
  const candidates = [];
  try {
    // Resolve where node-pty really lives (hoisted, pnpm, npx cache, global).
    const root = path.dirname(require.resolve('node-pty/package.json'));
    candidates.push(path.join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'));
    candidates.push(path.join(root, 'build', 'Release', 'spawn-helper'));
  } catch {
    // node-pty not installed; nothing to repair.
  }
  return candidates.filter((p) => fs.existsSync(p));
}

// Returns the list of helpers that were repaired. Throws if a helper is not
// executable and cannot be fixed (e.g. installed by root with sudo).
function ensureSpawnHelperExecutable() {
  const fixed = [];
  helperPaths().forEach((helperPath) => {
    try {
      fs.accessSync(helperPath, fs.constants.X_OK);
    } catch {
      fs.chmodSync(helperPath, 0o755);
      fixed.push(helperPath);
    }
  });
  return fixed;
}

module.exports = { ensureSpawnHelperExecutable };
