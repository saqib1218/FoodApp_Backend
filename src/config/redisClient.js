// config/redisClient.js
const Redis = require('ioredis');

let redis = null;

if (process.env.USE_REDIS === 'true') {
  redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  });

  redis.on('error', (err) => {
    console.error('Redis client error:', err);
  });
}

const getRedisClient = () => {
  if (!redis) {
    throw new Error('Redis client not initialized. Set USE_REDIS=true to enable.');
  }
  return redis;
};

module.exports = {
  redis,
  getRedisClient,
};
