const { ApiClient, authHeaders } = require('../lib/api-client');
const output = require('../lib/output');
const { AfError } = require('../lib/errors');

function logEventKey(data) {
  if (data && data.id !== undefined) return `id:${data.id}`;
  return JSON.stringify([data?.pod ?? null, data?.container ?? null, data?.timestamp ?? null, data?.line ?? data]);
}

function emitLogData(data, seen, order, emitter = output.stream) {
  const parsed = typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch { return { line: data }; } })() : data;
  const key = logEventKey(parsed);
  if (seen.has(key)) return false;
  seen.add(key);
  order.push(key);
  if (order.length > 2048) seen.delete(order.shift());
  emitter('log', parsed);
  return true;
}

async function followLogs(client, slug, options) {
  const url = new URL(`${client.baseUrl}/api/deployments/${encodeURIComponent(slug)}/logs`);
  if (options.sinceSeconds) url.searchParams.set('since_seconds', options.sinceSeconds);
  if (options.container) url.searchParams.set('container', options.container);
  let reconnects = 0;
  const seen = new Set();
  const seenOrder = [];
  while (true) {
    let response;
    try {
      response = await fetch(url, { headers: { Accept: 'text/event-stream', ...authHeaders(client.sessionToken) } });
    } catch (error) {
      if (reconnects === 0) throw new AfError(`Unable to stream logs: ${error.message}`, { code: 'upstream_unavailable' });
      response = null;
    }
    if (response && !response.ok) throw AfError.fromResponse(response.status, {});
    if (response) {
      if (reconnects > 0) output.stream('reconnected', { attempt: reconnects });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
          if (!data) continue;
          emitLogData(data, seen, seenOrder);
        }
      }
    }
    reconnects += 1;
    const delayMs = Math.min(30_000, 500 * (2 ** Math.min(reconnects, 6)));
    output.stream('disconnected', { retry_in_ms: delayMs, attempt: reconnects });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function logsCommand(program) {
  const logs = program.command('logs [slug]').description('Read deployment or build logs')
    .option('--follow', 'Stream deployment logs as NDJSON')
    .option('--tail <lines>', 'Snapshot lines per pod', '200')
    .option('--since-seconds <seconds>')
    .option('--cursor <cursor>').option('--container <name>')
    .action(async (slug, options) => {
      if (!slug) throw new AfError('deployment slug is required', { code: 'validation_failed' });
      if (options.follow && output.currentFormat() === 'yaml') {
        throw new AfError('logs --follow supports table or json NDJSON output, not yaml', { code: 'validation_failed' });
      }
      const client = new ApiClient();
      if (options.follow) return followLogs(client, slug, options);
      output.emit(await client.getLogSnapshot(slug, {
        tail_lines: options.tail, since_seconds: options.sinceSeconds,
        cursor: options.cursor, container: options.container,
      }));
    });

  logs.command('build <execution-id>')
    .description('Read bounded build/deploy stage logs')
    .option('--tail-bytes <bytes>', 'Bytes per stage', '16384')
    .option('--stage <name>')
    .action(async (executionId, options) => {
      const client = new ApiClient();
      output.emit(await client.getStageLogs(executionId, { tail_bytes: options.tailBytes, stage: options.stage }));
    });
}

module.exports = { logsCommand, followLogs, logEventKey, emitLogData };
