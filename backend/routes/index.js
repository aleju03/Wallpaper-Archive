const registerPublicRoutes = require('./public');
const registerWallpaperRoutes = require('./wallpapers');
const registerArenaRoutes = require('./arena');
const registerAdminRoutes = require('./admin');
const registerAuthRoutes = require('./auth');

/**
 * Register all routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} db - Database instance
 */
async function registerRoutes(fastify, db) {
  await registerAuthRoutes(fastify, db);
  await registerPublicRoutes(fastify, db);
  await registerWallpaperRoutes(fastify, db);
  await registerArenaRoutes(fastify, db);
  await registerAdminRoutes(fastify, db);
}

module.exports = {
  registerRoutes,
  registerAuthRoutes,
  registerPublicRoutes,
  registerWallpaperRoutes,
  registerArenaRoutes,
  registerAdminRoutes
};
