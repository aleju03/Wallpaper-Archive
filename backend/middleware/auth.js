const { ADMIN_API_KEY } = require('../config');

/**
 * Admin authentication hook for Fastify
 * Throws an error to stop request processing if unauthorized
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
  const key = keyFromHeader || request.headers['x-admin-key'];
  if (key !== ADMIN_API_KEY) {
    reply.code(401);
    throw new Error('Unauthorized');
  }
};

module.exports = {
  adminAuthHook
};
