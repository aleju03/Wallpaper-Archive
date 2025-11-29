const { ADMIN_API_KEY } = require('../config');

/**
 * Admin authentication check
 * @returns {boolean} - True if authenticated, false otherwise
 */
const requireAdminKey = (request, reply) => {
  if (!ADMIN_API_KEY) {
    reply.code(500).send({ success: false, error: 'Admin key not configured' });
    return false;
  }
  const authHeader = request.headers['authorization'];
  const keyFromHeader = authHeader && authHeader.toLowerCase().startsWith('bearer ') 
    ? authHeader.slice(7)
    : null;
  const key = keyFromHeader || request.headers['x-admin-key'];
  if (key !== ADMIN_API_KEY) {
    reply.code(401).send({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
};

/**
 * Admin authentication hook for Fastify
 */
const adminAuthHook = async (request, reply) => {
  if (!requireAdminKey(request, reply)) {
    return reply;
  }
};

module.exports = {
  requireAdminKey,
  adminAuthHook
};
