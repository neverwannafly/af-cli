const fs = require('fs');
const path = require('path');

const roots = ['bin', 'commands', 'lib'];
const violations = [];
for (const root of roots) {
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    if (!file.endsWith('.js')) continue;
    if (file === path.join('lib', 'output.js')) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/console\.log|process\.stdout\.write/.test(source)) violations.push(file);
  }
}
if (violations.length) {
  process.stderr.write(`Direct stdout writes are forbidden: ${violations.join(', ')}\n`);
  process.exitCode = 1;
}
