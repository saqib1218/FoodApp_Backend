// traceIdMiddleware.js
function traceIdMiddleware(req, res, next) {
  const incomingTraceId = req.headers['x-trace-id'];
  const traceId = incomingTraceId || `trc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  req.traceId = traceId;
  res.locals.traceId = traceId;
  // Optionally add to response headers for client visibility
  res.setHeader('X-Trace-Id', traceId);
  next();
}

module.exports = traceIdMiddleware;
