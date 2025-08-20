const logger = require('../config/logger');
const { maskObject } = require('../config/logger');

function maskSensitiveHeaders(headers) {
  const masked = { ...headers };
  if (masked.authorization) masked.authorization = '*****';
  if (masked.cookie) masked.cookie = '*****';
  return masked;
}

function loggingMiddleware(req, res, next) {
  const startTime = Date.now();

  // Mask sensitive request data
  const maskedReq = {
    traceId: req.traceId,
    method: req.method,
    url: req.originalUrl,
    body: maskObject(req.body),
    query: maskObject(req.query),
    params: maskObject(req.params),
    headers: maskSensitiveHeaders(req.headers),
    remoteAddress: req.ip,
  };

  logger.info(maskedReq, '📩 Incoming request');

  // Override res.send
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    let parsedBody;
    try {
      parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
    } catch {
      parsedBody = body;
    }

    let maskedResponse;
    try {
      maskedResponse = (parsedBody && typeof parsedBody === 'object')
        ? maskObject(parsedBody)
        : parsedBody;
    } catch (e) {
      maskedResponse = '[unable to serialize, circular reference]';
    }

    logger.info({
      traceId: req.traceId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      response: maskedResponse,
      duration_ms: Date.now() - startTime,
    }, '📤 Response sent');

    // Extra console log for completion time
    console.log(
      `[${new Date().toISOString()}] Logging completed for ${req.method} ${req.originalUrl} in ${Date.now() - startTime}ms`
    );

    return originalSend(body);
  };

  next();
}

module.exports = loggingMiddleware;
