const EXIT_CODES = Object.freeze({
  ok: 0,
  general: 1,
  auth: 2,
  not_found: 3,
  validation: 4,
  conflict: 5,
  quota: 6,
  verification_failed: 7,
  timeout: 8,
  canceled: 130,
});

const ERROR_EXIT_CODES = Object.freeze({
  unauthorized: EXIT_CODES.auth,
  forbidden: EXIT_CODES.auth,
  not_found: EXIT_CODES.not_found,
  already_exists: EXIT_CODES.conflict,
  validation_failed: EXIT_CODES.validation,
  precondition_not_met: EXIT_CODES.validation,
  invalid_state: EXIT_CODES.conflict,
  quota_exceeded: EXIT_CODES.quota,
  account_not_activated: EXIT_CODES.quota,
  build_failed: EXIT_CODES.verification_failed,
  deployment_verification_failed: EXIT_CODES.verification_failed,
  upstream_unavailable: EXIT_CODES.general,
  rate_limited: EXIT_CODES.general,
  internal_error: EXIT_CODES.general,
  timeout: EXIT_CODES.timeout,
  canceled: EXIT_CODES.canceled,
});

module.exports = { EXIT_CODES, ERROR_EXIT_CODES };
