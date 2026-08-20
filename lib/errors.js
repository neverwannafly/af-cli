const { ERROR_EXIT_CODES, EXIT_CODES } = require('./exit-codes');

const RETRYABLE = new Set(['upstream_unavailable', 'rate_limited', 'internal_error']);
const STATUS_CODES = Object.freeze({
  400: 'validation_failed', 401: 'unauthorized', 402: 'quota_exceeded',
  403: 'forbidden', 404: 'not_found', 409: 'invalid_state',
  422: 'validation_failed', 429: 'rate_limited', 500: 'internal_error',
  502: 'upstream_unavailable', 503: 'upstream_unavailable', 504: 'upstream_unavailable',
});

const NEXT = Object.freeze({
  unauthorized: [{ command: 'af-cli login', why: 'Authenticate again, then retry.' }],
  forbidden: [{ command: 'af-cli list deployments', why: 'Confirm which resources this token can see.' }],
  not_found: [{ command: 'af-cli list deployments', why: 'Get the exact deployment slug.' }],
  invalid_state: [{ command: 'af-cli status <slug>', why: 'Read the current state before retrying.' }],
  quota_exceeded: [{ command: 'af-cli quota', why: 'Inspect current limits and usage.' }],
  build_failed: [{ command: 'af-cli logs build <execution-id>', why: 'Read the failed build stage.' }],
  deployment_verification_failed: [{ command: 'af-cli status <slug>', why: 'Inspect the failed verification assertions.' }],
});

class AfError extends Error {
  constructor(message, options = {}) {
    super(message || 'API Frenzy CLI failed', { cause: options.cause });
    this.name = 'AfError';
    this.code = options.code || 'internal_error';
    this.details = options.details;
    this.next = options.next || NEXT[this.code] || [];
    this.retryable = options.retryable ?? RETRYABLE.has(this.code);
    this.exitCode = options.exitCode ?? ERROR_EXIT_CODES[this.code] ?? EXIT_CODES.general;
  }

  static fromResponse(status, body) {
    const payload = body && typeof body === 'object' ? body : {};
    const code = payload.code || STATUS_CODES[status] || 'internal_error';
    const message = payload.error || payload.message ||
      (Array.isArray(payload.errors) ? payload.errors.join(', ') : `API request failed (${status})`);
    return new AfError(message, { code, details: payload.details || payload });
  }
}

function normalizeError(error) {
  if (error instanceof AfError) return error;
  if (error?.code === 'commander.helpDisplayed') return null;
  if (String(error?.code || '').startsWith('commander.')) {
    return new AfError(error.message, { code: 'validation_failed', exitCode: EXIT_CODES.validation });
  }
  return new AfError(error?.message || String(error), { cause: error });
}

module.exports = { AfError, normalizeError, STATUS_CODES };
