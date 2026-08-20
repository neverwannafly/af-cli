const chalk = require('chalk');
const path = require('path');

const OUTPUT_VERSION = 1;
const FORMATS = new Set(['table', 'json', 'yaml']);
let format = 'table';
let emitted = false;
let guarded = false;
let authorizedWrite = false;
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

function installStdoutGuard() {
  if (guarded) return;
  guarded = true;
  const packageRoot = `${path.resolve(__dirname, '..')}${path.sep}`;
  process.stdout.write = function guardedStdoutWrite(chunk, encoding, callback) {
    if (authorizedWrite) return originalStdoutWrite(chunk, encoding, callback);
    const stack = new Error().stack || '';
    const firstOwnedFrame = stack.split('\n').find((line) =>
      !line.includes(`${path.sep}lib${path.sep}output.js`) &&
      (line.includes(packageRoot) || line.includes(`${path.sep}node_modules${path.sep}`)));
    const packageWrite = Boolean(firstOwnedFrame?.includes(packageRoot) && !firstOwnedFrame.includes(`${path.sep}node_modules${path.sep}`));
    if (packageWrite) throw new Error('Direct stdout writes are forbidden; use lib/output.js');
    return process.stderr.write(chunk, encoding, callback);
  };
}

function requestedFormat(argv = process.argv.slice(2), env = process.env) {
  let found = env.AF_OUTPUT || 'table';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '-o' || arg === '--output') && argv[index + 1]) found = argv[index + 1];
    else if (arg.startsWith('--output=')) found = arg.slice('--output='.length);
    else if (arg.startsWith('-o=')) found = arg.slice(3);
    else if (/^-o\w+/.test(arg)) found = arg.slice(2);
  }
  return found;
}

function configure(options = {}) {
  format = options.format || format;
  if (!FORMATS.has(format)) throw new Error(`Unsupported output format: ${format}`);
  if (format !== 'table' || options.color === false || !process.stdout.isTTY || process.env.NO_COLOR) chalk.level = 0;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function tableText(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'No results.';
    const rows = value.map((item) => (item && typeof item === 'object' ? item : { value: item }));
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const widths = keys.map((key) => Math.max(key.length, ...rows.map((row) => String(row[key] ?? '').length)));
    return [
      keys.map((key, i) => key.padEnd(widths[i])).join('  '),
      rows.map((row) => keys.map((key, i) => String(row[key] ?? '').padEnd(widths[i])).join('  ')).join('\n'),
    ].join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 2 && entries.some(([key]) => key === 'output_version')) {
      const dataEntry = entries.find(([key]) => key !== 'output_version');
      if (Array.isArray(dataEntry?.[1])) return `${dataEntry[0]}\n${tableText(dataEntry[1])}`;
    }
    return Object.entries(value).map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n');
  }
  return String(value ?? '');
}

function writeStdout(text) {
  authorizedWrite = true;
  try { originalStdoutWrite(`${text}\n`); } finally { authorizedWrite = false; }
}

function raw(text) {
  authorizedWrite = true;
  try { originalStdoutWrite(String(text)); } finally { authorizedWrite = false; }
}
function rawLine(text = '') { writeStdout(String(text)); }

function emit(value) {
  if (emitted) throw new Error('A finite CLI command may emit only one stdout document');
  emitted = true;
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? { output_version: OUTPUT_VERSION, ...value }
    : { output_version: OUTPUT_VERSION, data: value };
  if (format === 'json') writeStdout(stableStringify(payload));
  else if (format === 'yaml') writeStdout(JSON.stringify(stableValue(payload), null, 2)); // JSON is valid YAML 1.2.
  else writeStdout(tableText(payload));
  return payload;
}

function stream(event, data) {
  writeStdout(stableStringify({ event, data }));
}

function note(message) { process.stderr.write(`${message}\n`); }
function warn(message) { process.stderr.write(`Warning: ${message}\n`); }

function fail(error) {
  const envelope = {
    output_version: OUTPUT_VERSION,
    error: {
      code: error.code,
      message: error.message,
      next: error.next || [],
      ...(error.details !== undefined ? { details: error.details } : {}),
      retryable: Boolean(error.retryable),
    },
    exit_code: error.exitCode,
  };
  if (format === 'json' && !emitted) {
    emitted = true;
    writeStdout(stableStringify(envelope));
  } else {
    note(`Error [${error.code}]: ${error.message}`);
  }
  return error.exitCode;
}

function currentFormat() { return format; }
function resetForTest() { emitted = false; format = 'table'; }

module.exports = {
  OUTPUT_VERSION, configure, installStdoutGuard, requestedFormat, stableStringify, emit, stream,
  note, warn, fail, raw, rawLine, currentFormat, resetForTest,
};
