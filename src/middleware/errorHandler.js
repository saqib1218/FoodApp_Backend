const { sendError } = require('../utils/responseHelpers');
const BusinessError = require('../lib/businessErrors');
const logger = require('../config/logger'); // your Pino instance
const { maskObject } = require('../config/logger');

function errorHandler(err, req, res, next) {
  // Mask the error for logging
  const maskedError = maskObject(err);

  logger.error({
    traceId: req.traceId,
    method: req.method,
    url: req.originalUrl,
    err: maskedError
  }, '❌ Error occurred');

  if (err instanceof BusinessError) {
    return sendError(res, {
      code: err.code,
      message: err.message,
      i18n_key: err.i18n_key,
      details: err.details,
      retryable: err.retryable,
      retry_after_seconds: err.retry_after_seconds,
      traceId: err.trace_id || req.traceId || null,
      docs_url: err.docs_url || null,
      statusCode: err.httpStatus,
    });
  }

  // fallback for unknown errors
  return sendError(res, {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
    i18n_key: 'common.internal_error',
    retryable: true,
    traceId: req.traceId || null,
    statusCode: 500,
  });
}

module.exports = errorHandler;
