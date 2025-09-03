// errors/businessError.js
const errorCatalog = require('../config/error-catalog.json');

class BusinessError extends Error {
  constructor(
    code,
    {
      details = {},
      meta = {},
      traceId = null,
      retryable,
      retry_after_seconds
    } = {}
  ) {
    // 🔹 Resolve nested key from catalog
    const keys = code.split('.');
    let config = errorCatalog;
    for (const key of keys) {
      if (!config[key]) {
        config = null;
        break;
      }
      config = config[key];
    }

    if (!config) {
      // ⚠️ Fall back to a generic error instead of crashing the app
      super(`Unknown business error code: ${code}`);
      this.success = false;
      this.code = 'UNKNOWN_ERROR';
      this.httpStatus = 500;
      this.message = 'An unexpected error occurred.';
      this.i18n_key = 'common.unknown_error';
      this.details = { fields: [], meta: {} };
      this.retryable = false;
      this.retry_after_seconds = null;
      this.trace_id = traceId;
      return;
    }

    // Normal case
    super(config.message);

    this.success = false;
    this.code = code;
    this.httpStatus = config.http_status || 400;
    this.message = config.message;
    this.i18n_key = config.i18n_key || code.toLowerCase().replace(/\./g, '_');

 this.details = {
  fields: details.fields || [],
  meta: {
    ...(details.meta || {}),  // ✅ take meta inside details
    ...(meta || {})           // ✅ also allow top-level meta
  }
};


    // Allow overrides
    this.retryable =
      typeof retryable !== 'undefined'
        ? retryable
        : typeof config.retryable !== 'undefined'
        ? config.retryable
        : false;

    this.retry_after_seconds =
      typeof retry_after_seconds !== 'undefined'
        ? retry_after_seconds
        : typeof config.retry_after_seconds !== 'undefined'
        ? config.retry_after_seconds
        : null;

    this.trace_id = traceId;
  }
}

module.exports = BusinessError;
