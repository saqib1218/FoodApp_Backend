const successCatalog = require("../config/success-catalog.json");

const sendSuccess = (res, key, data = {}) => {
  const catalogEntry = successCatalog[key];

  if (!catalogEntry) {
    return res.status(500).json({
      success: false,
      code: "SUCCESS_KEY_NOT_FOUND",
      trace_id: res.req.trace_id, // use from middleware
      message: "Success catalog entry not found."
    });
  }

  return res.status(catalogEntry.http_status || 200).json({
    success: true,
    code: catalogEntry.code,
    i18n_key: catalogEntry.i18n_key,
    trace_id: res.req.trace_id, // use from middleware
    message: catalogEntry.message,
    data
  });
};

function sendError(
  res,
  {
    code = "INTERNAL_ERROR",
    message = "An unexpected error occurred.",
    i18n_key = null,
    details = { fields: [], meta: {} },
    retryable = false,
    retry_after_seconds = null,
    statusCode = 500
  } = {}
) {
  const response = {
    success: false,
    code,
    message,
    i18n_key,
    details,
    retryable,
    retry_after_seconds,
    trace_id: res.req.trace_id // use from middleware
  };

  return res.status(statusCode).json(response);
}

module.exports = { sendSuccess, sendError };
