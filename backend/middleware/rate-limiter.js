const { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, RATE_LIMIT_DRIVER } = require('../config');

// Simple in-memory rate limiter
const rateBuckets = new Map();

/**
 * Get client identifier for rate limiting
 */
const getClientId = (request) => {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.ip || 'unknown';
};

/**
 * Create rate limiter hook for Fastify
 * @param {Object} db - Database instance for database-backed rate limiting
 * @param {Object} fastify - Fastify instance for logging
 */
const createRateLimiter = (db, fastify) => {
  return async (request, reply) => {
    const now = Date.now();
    const clientId = getClientId(request);

    if (RATE_LIMIT_DRIVER === 'database') {
      try {
        const result = await db.consumeRateLimit(clientId, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
        if (!result.allowed) {
          reply.code(429).send({ success: false, error: 'Too many requests' });
          return;
        }
        reply.header('X-RateLimit-Reset', result.resetAt);
        return;
      } catch (error) {
        fastify.log.warn({ err: error }, 'Database rate limit failed, falling back to in-memory buckets');
      }
    }

    const bucket = rateBuckets.get(clientId) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };

    if (now > bucket.reset) {
      bucket.count = 0;
      bucket.reset = now + RATE_LIMIT_WINDOW_MS;
    }

    bucket.count += 1;
    rateBuckets.set(clientId, bucket);

    if (bucket.count > RATE_LIMIT_MAX) {
      reply.code(429).send({ success: false, error: 'Too many requests' });
      return;
    }
  };
};

module.exports = {
  createRateLimiter,
  getClientId
};
