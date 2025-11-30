const { verifyAdminCredentials, generateToken } = require('../middleware');

/**
 * Register authentication routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} db - Database instance
 */
async function registerAuthRoutes(fastify, db) {
  /**
   * POST /api/auth/login
   * Admin login endpoint
   */
  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required' });
    }

    try {
      const isValid = await verifyAdminCredentials(username, password);

      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const token = generateToken(username);

      return reply.send({
        success: true,
        token,
        user: { username, role: 'admin' }
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Authentication failed' });
    }
  });

  /**
   * GET /api/auth/verify
   * Verify JWT token validity
   */
  fastify.get('/api/auth/verify', {
    onRequest: async (request, reply) => {
      const { adminAuthHook } = require('../middleware');
      await adminAuthHook(request, reply);
    }
  }, async (request, reply) => {
    return reply.send({
      success: true,
      user: request.user
    });
  });
}

module.exports = registerAuthRoutes;
