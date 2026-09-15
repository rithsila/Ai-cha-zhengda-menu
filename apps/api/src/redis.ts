import Redis from 'ioredis';

// Use REDIS_URL from environment (Railway standard)
// Fallback to localhost for local development if needed, or fail gracefully
const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;

if (!redisUrl) {
  console.warn('⚠️ No REDIS_URL found in environment. Rate limiting and sessions will fail or fallback to memory if not handled.');
}

export const redis = redisUrl ? new Redis(redisUrl) : new Redis(); // defaults to localhost:6379

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis successfully');
});
