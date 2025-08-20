// errors/businessError.js
const errorCatalog = require('../config/error-catalog.json');

class BusinessError extends Error {
  constructor(code, { 
    details = {}, 
    meta = {}, 
    traceId = null, 
    retryable,             // allow override
    retry_after_seconds    // allow override
  } = {}) {
    const config = errorCatalog[code];

    if (!config) {
      throw new Error(`Unknown business error code: ${code}`);
    }

    super(config.message);

    this.success = false;
    this.code = code;
    this.httpStatus = config.http_status;
    this.message = config.message;
    this.i18n_key = config.i18n_key;
    this.details = {
      fields: details.fields || [],
      meta: { ...meta }
    };

    // Use override if provided, else fallback to catalog, else default
    this.retryable = typeof retryable !== 'undefined' ? retryable 
                     : (typeof config.retryable !== 'undefined' ? config.retryable : false);

    this.retry_after_seconds = typeof retry_after_seconds !== 'undefined' ? retry_after_seconds 
                               : (typeof config.retry_after_seconds !== 'undefined' ? config.retry_after_seconds : null);

    this.trace_id = traceId;  // assign the passed traceId
  }
}

module.exports = BusinessError;
