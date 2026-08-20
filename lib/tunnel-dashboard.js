const chalk = require('chalk');
const output = require('./output');

const MAX_LOGS = 100;
const TABLE_ROWS = 18;
const RENDER_INTERVAL_MS = 2000;
const THROUGHPUT_BUCKET_MS = 2000;
const THROUGHPUT_BUCKETS = 15;
const SPARK_CHARS = '._:-=+*#%@';
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

function visibleLength(value) {
  return String(value ?? '').replace(ANSI_PATTERN, '').length;
}

function pad(value, width) {
  const text = String(value ?? '');
  const length = visibleLength(text);
  if (length >= width) return text;
  return text + ' '.repeat(width - length);
}

function right(value, width) {
  const text = String(value ?? '');
  const length = visibleLength(text);
  if (length >= width) return text;
  return ' '.repeat(width - length) + text;
}

function truncate(value, width) {
  const text = String(value ?? '');
  if (visibleLength(text) <= width) return text;
  return text.slice(0, Math.max(0, width - 3)) + '...';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function percentile(values, pct) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function statusColor(status) {
  if (status >= 500) return chalk.red(String(status));
  if (status >= 400) return chalk.yellow(String(status));
  if (status >= 300) return chalk.cyan(String(status));
  if (status >= 200) return chalk.green(String(status));
  return chalk.gray(String(status || '-'));
}

function nowTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

class TunnelDashboard {
  constructor({ publicUrl, localPort }) {
    this.publicUrl = publicUrl;
    this.localPort = localPort;
    this.logs = [];
    this.startedAt = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.renderInterval = null;
    this.nextLogSeq = 1;
    this.printedLogSeq = 0;
  }

  start() {
    this.render();
    if (!this.renderInterval) {
      this.renderInterval = setInterval(() => this.render(), RENDER_INTERVAL_MS);
    }
  }

  stop() {
    if (this.renderInterval) clearInterval(this.renderInterval);
    this.renderInterval = null;
  }

  add(entry) {
    const normalized = {
      seq: this.nextLogSeq,
      ts: Date.now(),
      type: 'HTTP',
      method: '-',
      path: '/',
      status: null,
      durationMs: null,
      requestBytes: 0,
      responseBytes: 0,
      note: '',
      ...entry,
    };
    this.nextLogSeq += 1;

    this.logs.push(normalized);
    if (this.logs.length > MAX_LOGS) this.logs.shift();

    if (normalized.type === 'HTTP') {
      this.requestCount += 1;
      if (normalized.status >= 400) this.errorCount += 1;
    }
    this.bytesIn += normalized.requestBytes || 0;
    this.bytesOut += normalized.responseBytes || 0;
  }

  stats() {
    const durations = this.logs
      .filter((log) => log.type === 'HTTP' && Number.isFinite(log.durationMs))
      .map((log) => log.durationMs);

    return {
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      requests: this.requestCount,
      errors: this.errorCount,
      bytesIn: this.bytesIn,
      bytesOut: this.bytesOut,
    };
  }

  throughputBuckets() {
    const now = Date.now();
    const windowStart = now - THROUGHPUT_BUCKET_MS * THROUGHPUT_BUCKETS;
    const buckets = Array.from({ length: THROUGHPUT_BUCKETS }, () => 0);

    for (const log of this.logs) {
      if (log.type !== 'HTTP' || log.ts < windowStart) continue;
      const index = Math.floor((log.ts - windowStart) / THROUGHPUT_BUCKET_MS);
      if (index >= 0 && index < buckets.length) buckets[index] += 1;
    }

    return buckets;
  }

  throughputGraph() {
    const buckets = this.throughputBuckets();
    const max = Math.max(...buckets, 1);
    const graph = buckets
      .map((count) => {
        const index = Math.round((count / max) * (SPARK_CHARS.length - 1));
        return SPARK_CHARS[index];
      })
      .join('');
    const peak = max / (THROUGHPUT_BUCKET_MS / 1000);

    return { graph, peak };
  }

  render() {
    if (!process.stdout.isTTY) {
      const rows = this.logs.filter((log) => log.seq > this.printedLogSeq);
      for (const log of rows) output.stream('tunnel', log);
      if (rows.length > 0) this.printedLogSeq = rows[rows.length - 1].seq;
      return;
    }

    const stats = this.stats();
    const throughput = this.throughputGraph();
    output.raw('\x1b[2J\x1b[H');
    output.rawLine(chalk.bold('API Frenzy Tunnel'));
    output.rawLine(`${chalk.gray('Public')}  ${this.publicUrl || '-'}`);
    output.rawLine(`${chalk.gray('Local')}   http://127.0.0.1:${this.localPort}`);
    output.rawLine(`${chalk.gray('Uptime')}  ${stats.uptimeSeconds}s`);
    output.rawLine();
    output.rawLine([
      `${chalk.gray('Requests')} ${chalk.bold(stats.requests)}`,
      `${chalk.gray('Errors')} ${stats.errors ? chalk.red(stats.errors) : chalk.green(0)}`,
      `${chalk.gray('p50')} ${formatDuration(stats.p50)}`,
      `${chalk.gray('p95')} ${formatDuration(stats.p95)}`,
      `${chalk.gray('p99')} ${formatDuration(stats.p99)}`,
      `${chalk.gray('In')} ${formatBytes(stats.bytesIn)}`,
      `${chalk.gray('Out')} ${formatBytes(stats.bytesOut)}`,
    ].join('  '));
    output.rawLine();
    output.rawLine(`${chalk.gray('Throughput')} [${chalk.cyan(throughput.graph)}] ${chalk.gray('last 30s, 2s buckets, peak')} ${throughput.peak.toFixed(1)} req/s`);
    output.rawLine();
    output.rawLine(chalk.gray('Press Ctrl+C to stop. Showing last 100 in-memory events.'));
    // Durable analytics belong in backend infra later: ClickHouse, SigNoz, or a similar metrics/log pipeline.
    output.rawLine();
    output.rawLine(chalk.gray(`${pad('TIME', 8)} ${pad('TYPE', 5)} ${pad('METHOD', 7)} ${pad('PATH', 34)} ${right('STATUS', 6)} ${right('DURATION', 9)} ${right('IN', 9)} ${right('OUT', 9)}  NOTE`));
    output.rawLine(chalk.gray('-'.repeat(112)));

    const rows = this.logs.slice(-TABLE_ROWS);
    if (rows.length === 0) {
      output.rawLine(chalk.gray('Waiting for requests...'));
      return;
    }

    for (const log of rows) {
      output.rawLine(this.formatLogLine(log));
    }
  }

  formatLogLine(log) {
    const path = log.path || '/';
    const note = log.note || '';
    return [
      chalk.gray(pad(nowTime(log.ts), 8)),
      pad(log.type, 5),
      pad(log.method || '-', 7),
      pad(truncate(path, 34), 34),
      right(statusColor(log.status), 6),
      right(formatDuration(log.durationMs), 9),
      right(formatBytes(log.requestBytes), 9),
      right(formatBytes(log.responseBytes), 9),
      truncate(note, 32),
    ].join(' ');
  }
}

module.exports = {
  TunnelDashboard,
};
