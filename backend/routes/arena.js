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
      
      // Parse filter parameters
      const filters = {
        provider: request.query.provider || null,
        aspect: request.query.aspect || null,
        mode: request.query.mode || null // 'newcomers', 'underdog', or null for standard
      };
      
      // Use filtered query if any filters are active
      const hasFilters = filters.provider || filters.aspect || filters.mode;
      const wallpapers = hasFilters 
        ? await db.getFilteredBattlePair(filters, excludeIds)
        : await db.getRandomWallpaperPair(excludeIds);
      
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

  // Undo last vote
  fastify.post('/api/arena/undo', async (request, reply) => {
    try {
      const { winnerId, loserId, winnerOldElo, loserOldElo } = request.body;
      
      if (!winnerId || !loserId || winnerOldElo === undefined || loserOldElo === undefined) {
        reply.code(400);
        return { success: false, error: 'Missing required fields for undo' };
      }

      const success = await db.undoBattle(
        parseInt(winnerId), 
        parseInt(loserId), 
        parseInt(winnerOldElo), 
        parseInt(loserOldElo)
      );
      
      return { success };
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

  // Admin-only: Get battle history
  fastify.get('/api/arena/history', async (request, reply) => {
    try {
      const limit = parseInt(request.query.limit) || 50;
      const history = await db.getBattleHistory(limit);
      
      // Add thumbnail URLs
      const historyWithUrls = history.map(battle => ({
        ...battle,
        winner_thumbnail_url: buildThumbnailUrl(battle.winner_download_url),
        loser_thumbnail_url: buildThumbnailUrl(battle.loser_download_url)
      }));

      return {
        success: true,
        history: historyWithUrls
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin-only: Get arena statistics
  fastify.get('/api/arena/stats', async (request, reply) => {
    try {
      const stats = await db.getArenaStats();
      
      // Add thumbnail URLs to wallpapers in stats
      const addThumbnails = (wallpapers) => wallpapers.map(w => ({
        ...w,
        thumbnail_url: buildThumbnailUrl(w.download_url)
      }));

      return {
        success: true,
        stats: {
          ...stats,
          mostImproved: addThumbnails(stats.mostImproved),
          biggestLosers: addThumbnails(stats.biggestLosers),
          controversial: addThumbnails(stats.controversial)
        }
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerArenaRoutes;
