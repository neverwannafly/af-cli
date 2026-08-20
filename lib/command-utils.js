const fs = require('fs');
const readline = require('readline');
const { AfError } = require('./errors');

function unwrapOne(payload) {
  const data = payload?.data ?? payload;
  if (data?.attributes) return { id: data.id, ...data.attributes };
  return data;
}

function unwrapMany(payload) {
  const data = payload?.data ?? payload;
  if (!Array.isArray(data)) return [];
  return data.map((item) => (item?.attributes ? { id: item.id, ...item.attributes } : item));
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AfError(`${name} must be a positive integer`, { code: 'validation_failed' });
  return parsed;
}

function durationMs(value = '10m') {
  const match = String(value).trim().match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) throw new AfError(`Invalid duration: ${value}`, { code: 'validation_failed' });
  const units = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return Number(match[1]) * units[match[2] || 's'];
}

function collect(value, previous) { return [...previous, value]; }

function envMap(values = [], envFile) {
  const entries = [...values];
  if (envFile) {
    entries.push(...fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith('#')));
  }
  return entries.reduce((result, entry) => {
    const separator = entry.indexOf('=');
    if (separator < 1) throw new AfError(`Environment entry must be KEY=VALUE: ${entry}`, { code: 'validation_failed' });
    result[entry.slice(0, separator)] = entry.slice(separator + 1);
    return result;
  }, {});
}

function validateName(name) {
  if (!name) throw new AfError('--name is required', { code: 'validation_failed' });
  if (name.includes('-dp-') || name.includes('-tn-')) {
    throw new AfError('--name cannot contain reserved markers -dp- or -tn-', { code: 'validation_failed' });
  }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function confirm(message, assumeYes) {
  if (assumeYes) return;
  if (!process.stdin.isTTY) throw new AfError('Confirmation requires --yes in a non-interactive shell', { code: 'canceled' });
  const answer = await new Promise((resolve) => {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stderr });
    prompt.question(`${message} [y/N] `, (value) => { prompt.close(); resolve(value); });
  });
  if (!/^y(es)?$/i.test(answer.trim())) throw new AfError('Operation canceled', { code: 'canceled' });
}

module.exports = { unwrapOne, unwrapMany, positiveInteger, durationMs, collect, envMap, validateName, delay, confirm };
