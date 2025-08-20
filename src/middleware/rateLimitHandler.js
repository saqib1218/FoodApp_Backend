const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const BusinessError = require('../lib/businessErrors');
const { sendError } = require('../utils/responseHelpers');
const { getRedisClient } = require('../config/redisClient'); // import Redis client

const rateLimitHandler = rateLimit({
  store: process.env.USE_REDIS === 'true'
    ? new RedisStore({
        sendCommand: (...args) => getRedisClient().send_command(...args),
      })
    : undefined, // fallback to in-memory store if Redis not used
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // max 5 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    try {
      const traceId = req.traceId || null;
      const key = `rl:${req.ip}`;
      let retryAfterSeconds = 0;

      if (process.env.USE_REDIS === 'true') {
        const ttl = await getRedisClient().ttl(key);
        retryAfterSeconds = ttl > 0 ? ttl : 0;
      }

      const error = new BusinessError('RATE_LIMITED', {
        retry_after_seconds: retryAfterSeconds,
        retryable: retryAfterSeconds === 0,
        traceId,
      });

      return sendError(res, {
        code: error.code,
        message: error.message,
        i18n_key: error.i18n_key,
        retryable: error.retryable,
        retry_after_seconds: error.retry_after_seconds,
        traceId: error.traceId,
        details: error.details,
      });

    } catch (err) {
      console.error('Error in rate limit handler:', err);

      const fallbackError = new BusinessError('RATE_LIMITED', {
        retry_after_seconds: 3600,
        retryable: false,
        traceId: req.traceId || null,
      });

      return sendError(res, {
        code: fallbackError.code,
        message: fallbackError.message,
        i18n_key: fallbackError.i18n_key,
        retryable: fallbackError.retryable,
        retry_after_seconds: fallbackError.retry_after_seconds,
        traceId: fallbackError.traceId,
        details: fallbackError.details,
      });
    }
  },
});

module.exports = rateLimitHandler;
