const output = require('../lib/output');

output.installStdoutGuard();
process.stdout.write('forbidden\n');
