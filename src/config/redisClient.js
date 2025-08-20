const Redis = require('ioredis');

let redisClient;

const getRedisClient = () => {
  if (!redisClient && process.env.USE_REDIS === 'true') {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }
  return redisClient;
};

module.exports = { getRedisClient };
