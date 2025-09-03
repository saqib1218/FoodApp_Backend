const successCatalog = require("../config/success-catalog.json");
const { toCamel } = require("./caseConverters");

const getNestedCatalogEntry = (key) => {
  return key.split('.').reduce((acc, k) => acc?.[k], successCatalog);
};

// 4th parameter = meta (pagination, sorting, etc.)
const sendSuccess = (res, key, data = {}, meta = {}) => {
  const catalogEntry = getNestedCatalogEntry(key);

  if (!catalogEntry) {
    return res.status(500).json({
      success: false,
      code: "SUCCESS_KEY_NOT_FOUND",
      trace_id:res.req.traceId,
      message: `Success catalog entry not found for key: ${key}`
    });
  }

return res.status(catalogEntry.http_status || 200).json({
  success: true,
  code: catalogEntry.code,
  i18n_key: catalogEntry.i18n_key,
  message: catalogEntry.message,
  data: toCamel(data),   // your actual data
  meta,                  // pagination, sorting, etc.
  trace_id: res.req.traceId // always top-level
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
  return res.status(statusCode).json({
    success: false,
    code,
    message,
    i18n_key,
    details,
    retryable,
    retry_after_seconds,
    trace_id: res.req.traceId // always top-level
  });
}

module.exports = { sendSuccess, sendError };
