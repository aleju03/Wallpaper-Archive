const { ADMIN_API_KEY } = require('../config');

/**
 * Admin authentication hook for Fastify
 * Throws an error to stop request processing if unauthorized
 * Supports: Authorization header, X-Admin-Key header, or adminKey query param (for SSE)
 */
const adminAuthHook = async (request, reply) => {
  if (!ADMIN_API_KEY) {
    reply.code(500);
    throw new Error('Admin key not configured');
  }
  const authHeader = request.headers['authorization'];
  const keyFromHeader = authHeader && authHeader.toLowerCase().startsWith('bearer ') 
    ? authHeader.slice(7)
    : null;
  // Support query param for SSE (EventSource doesn't support custom headers)
  const keyFromQuery = request.query?.adminKey;
  const key = keyFromHeader || request.headers['x-admin-key'] || keyFromQuery;
  if (key !== ADMIN_API_KEY) {
    reply.code(401);
    throw new Error('Unauthorized');
  }
};

module.exports = {
  adminAuthHook
};
