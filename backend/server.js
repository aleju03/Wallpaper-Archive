const fastify = require('fastify')({ 
  logger: {
    level: 'warn'
  },
  disableRequestLogging: true
});

const config = require('./config');
const Database = require('./database');
const { createRateLimiter } = require('./middleware');
const { registerRoutes } = require('./routes');

// Initialize database client
const db = new Database();

// Register rate limiter
fastify.addHook('onRequest', createRateLimiter(db, fastify));

// Enable CORS
fastify.register(require('@fastify/cors'), {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (!config.ALLOWED_ORIGINS.length) return cb(null, true);
    if (config.ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
});

// Enable multipart
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB per file
  }
});

// Register all routes
registerRoutes(fastify, db);

// Export for Vercel Serverless
module.exports = async (req, res) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

// Start local server if running directly
if (require.main === module) {
  const start = async () => {
    try {
      await fastify.listen({ port: 3000, host: '0.0.0.0' });
      console.log('Server listening on http://localhost:3000');
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  start();
}
