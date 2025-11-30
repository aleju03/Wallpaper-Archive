const { setCache, buildThumbnailUrl, normalizePagination } = require('../utils/helpers');

/**
 * Register wallpaper routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} db - Database instance
 */
async function registerWallpaperRoutes(fastify, db) {
  // Get largest wallpapers by file size (must be before :id route)
  fastify.get('/api/wallpapers/largest', async (request, reply) => {
    try {
      const { limit = 10 } = request.query;
      const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 50);
      
      const wallpapers = await db.getLargestWallpapers(safeLimit);
      
      setCache(reply, 300);
      
      return {
        success: true,
        wallpapers: wallpapers.map(w => ({
          ...w,
          image_url: w.download_url,
          thumbnail_url: buildThumbnailUrl(w.download_url)
        }))
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get most downloaded wallpapers
  fastify.get('/api/wallpapers/most-downloaded', async (request, reply) => {
    try {
      const { limit = 20 } = request.query;
      const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
      
      const wallpapers = await db.getMostDownloadedWallpapers(safeLimit);
      
      setCache(reply, 120);
      
      return {
        success: true,
        wallpapers: wallpapers.map(w => ({
          ...w,
          image_url: w.download_url,
          thumbnail_url: buildThumbnailUrl(w.download_url)
        }))
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/api/wallpapers', async (request, reply) => {
    try {
      const { provider, folder, folders, search, resolution, aspect, limit = 50, page = 1 } = request.query;
      const { limit: safeLimit, page: safePage, offset } = normalizePagination(limit, page);
      
      const filters = {};
      if (provider) filters.provider = provider;
      // Support both single folder and multiple folders (comma-separated)
      if (folders) {
        filters.folders = folders.split(',').map(f => f.trim()).filter(Boolean);
      } else if (folder) {
        filters.folder = folder;
      }
      if (search) filters.search = search;
      if (resolution) filters.resolution = resolution;
      if (aspect) filters.aspect = aspect;
      filters.limit = safeLimit;
      filters.offset = offset;

      const [wallpapers, total] = await Promise.all([
        db.getWallpapers(filters),
        db.getWallpapersCount(filters)
      ]);
      
      const currentPage = safePage;
      const totalPages = Math.ceil(total / safeLimit);
      const hasNextPage = currentPage < totalPages;

      setCache(reply, 120);
      
      return {
        wallpapers: wallpapers.map(w => ({
          ...w,
          filename: w.filename,
          image_url: w.download_url,
          thumbnail_url: buildThumbnailUrl(w.download_url)
        })),
        total: total,
        page: currentPage,
        limit: safeLimit,
        hasNextPage: hasNextPage,
        totalPages: totalPages
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/api/wallpapers/random', async (request, reply) => {
    try {
      const wallpaper = await db.getRandomWallpaper();
      
      if (!wallpaper) {
        reply.code(404);
        return { success: false, error: 'No wallpapers found' };
      }

      // Prevent caching for random results
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');

      return {
        success: true,
        wallpaper: {
          ...wallpaper,
          image_url: wallpaper.download_url,
          thumbnail_url: buildThumbnailUrl(wallpaper.download_url)
        }
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/api/wallpapers/:id', async (request, reply) => {
    try {
      const wallpaper = await db.getWallpaperById(request.params.id);
      
      if (!wallpaper) {
        reply.code(404);
        return { success: false, error: 'Wallpaper not found' };
      }

      setCache(reply, 300);

      return {
        success: true,
        wallpaper: {
          ...wallpaper,
          image_url: wallpaper.download_url,
          thumbnail_url: buildThumbnailUrl(wallpaper.download_url)
        }
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Download proxy endpoint - forces browser to download the file
  fastify.get('/api/download/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const wallpaper = await db.getWallpaperById(id);
      
      if (!wallpaper) {
        reply.code(404);
        return { success: false, error: 'Wallpaper not found' };
      }

      try {
        await db.incrementDownloadCount(wallpaper.id);
      } catch (err) {
        fastify.log.warn({ err, id }, 'Failed to increment download count');
      }

      const imageUrl = wallpaper.download_url;
      const filename = wallpaper.filename;

      // Use https/http module for more reliable fetching
      const https = require('https');
      const http = require('http');
      const url = new URL(imageUrl);
      const client = url.protocol === 'https:' ? https : http;

      return new Promise((resolve, reject) => {
        client.get(imageUrl, (response) => {
          if (response.statusCode !== 200) {
            reply.code(502);
            resolve({ success: false, error: 'Failed to fetch image from source' });
            return;
          }

          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const contentType = response.headers['content-type'] || 'application/octet-stream';

            reply.header('Content-Type', contentType);
            reply.header('Content-Disposition', `attachment; filename="${filename}"`);
            reply.header('Content-Length', buffer.length);
            reply.header('Cache-Control', 'public, max-age=86400');
            
            resolve(reply.send(buffer));
          });
          response.on('error', (err) => {
            reply.code(500);
            resolve({ success: false, error: 'Download stream failed' });
          });
        }).on('error', (err) => {
          reply.code(500);
          resolve({ success: false, error: 'Download request failed' });
        });
      });
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Download failed' };
    }
  });
}

module.exports = registerWallpaperRoutes;
