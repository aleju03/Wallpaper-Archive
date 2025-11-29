const { setCache, buildThumbnailUrl, normalizePagination } = require('../utils/helpers');

/**
 * Register arena routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} db - Database instance
 */
async function registerArenaRoutes(fastify, db) {
  fastify.get('/api/arena/battle', async (request, reply) => {
    try {
      // Parse exclude parameter for session-based deduplication
      const excludeParam = request.query.exclude || '';
      const excludeIds = excludeParam
        .split(',')
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
      
      const wallpapers = await db.getRandomWallpaperPair(excludeIds);
      
      if (wallpapers.length < 2) {
        reply.code(400);
        return { success: false, error: 'Not enough wallpapers for battle' };
      }

      // Add image and thumbnail URLs  
      const wallpapersWithUrls = wallpapers.map(wallpaper => ({
        ...wallpaper,
        image_url: wallpaper.download_url,
        thumbnail_url: buildThumbnailUrl(wallpaper.download_url)
      }));

      return {
        success: true,
        wallpapers: wallpapersWithUrls
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  fastify.post('/api/arena/vote', async (request, reply) => {
    try {
      const { winnerId, loserId, voteTimeMs } = request.body;
      
      if (!winnerId || !loserId) {
        reply.code(400);
        return { success: false, error: 'Winner and loser IDs are required' };
      }

      if (winnerId === loserId) {
        reply.code(400);
        return { success: false, error: 'Winner and loser cannot be the same' };
      }

      const result = await db.updateArenaResults(parseInt(winnerId), parseInt(loserId), voteTimeMs);
      
      return {
        success: true,
        result: result
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/api/arena/leaderboard', async (request, reply) => {
    try {
      const limit = parseInt(request.query.limit) || 50;
      const { limit: safeLimit } = normalizePagination(limit, 1, 100);
      const getBottom = request.query.bottom === 'true';
      const leaderboard = await db.getLeaderboard(safeLimit, getBottom);
      const totalCount = await db.getTotalWallpaperCount();
      
      // Add image and thumbnail URLs
      const leaderboardWithUrls = leaderboard.map(wallpaper => ({
        ...wallpaper,
        image_url: wallpaper.download_url,
        thumbnail_url: buildThumbnailUrl(wallpaper.download_url)
      }));

      setCache(reply, 120);

      return {
        success: true,
        leaderboard: leaderboardWithUrls,
        totalCount
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerArenaRoutes;
