const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const config = require('../config');
const { setCache, sanitizeFilename, guessMime } = require('../utils/helpers');
const { fetchRemoteObject, getObjectFromStorage } = require('../services/storage');

/**
 * Register public routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} db - Database instance
 */
async function registerPublicRoutes(fastify, db) {
  const sanitizeStoragePath = (value = '') => value
    .split('/')
    .map(segment => sanitizeFilename(segment))
    .filter(Boolean)
    .join('/');

  const serveAsset = async (request, reply, type) => {
    const requestedPath = request.params['*'] || request.params.file || '';
    const safePath = sanitizeStoragePath(requestedPath);

    try {
      if (!safePath) {
        reply.code(404);
        return { success: false, error: 'File not found' };
      }

      if (config.B2_ENABLED) {
        const key = `${type}/${safePath}`;
        const object = await getObjectFromStorage(key);
        reply.header('Content-Type', object.contentType || guessMime(safePath));
        if (object.contentLength) {
          reply.header('Content-Length', object.contentLength);
        }
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(object.body);
      }

      const targetDir = type === 'thumbnails' ? config.LOCAL_THUMBNAILS_DIR : config.LOCAL_DOWNLOADS_DIR;
      const filePath = path.join(targetDir, path.basename(safePath));
      await fsPromises.access(filePath);
      reply.header('Content-Type', guessMime(filePath));
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(fs.createReadStream(filePath));
    } catch (error) {
      try {
        const wallpaper = await findWallpaperForAsset(type, safePath);
        if (!wallpaper?.download_url) throw error;

        const remoteUrl = type === 'images'
          ? wallpaper.download_url
          : wallpaper.download_url
            .replace('/images/', '/thumbnails/')
            .replace(/\.[^/.]+$/, '.jpg');
        const object = await fetchRemoteObject(remoteUrl);

        reply.header('Content-Type', object.contentType || guessMime(safePath));
        if (object.contentLength) {
          reply.header('Content-Length', object.contentLength);
        }
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(object.body);
      } catch (fallbackError) {
        reply.code(404);
        return { success: false, error: `${type === 'thumbnails' ? 'Thumbnail' : 'Image'} not found` };
      }
    }
  };

  const findWallpaperForAsset = async (type, safePath) => {
    const filename = path.basename(safePath);
    if (!filename || !db?.getWallpapers) return null;

    const imageFilename = type === 'thumbnails'
      ? filename.replace(/\.jpg$/i, '')
      : filename;
    const candidates = await db.getWallpapers({
      search: imageFilename,
      limit: 25,
      offset: 0
    });

    return candidates.find((wallpaper) => {
      const downloadPath = (() => {
        try {
          return new URL(wallpaper.download_url).pathname.replace(/^\//, '');
        } catch {
          return wallpaper.download_url || '';
        }
      })();

      if (type === 'images') {
        return downloadPath.endsWith(`/${safePath}`) || wallpaper.filename === filename;
      }

      const thumbPath = downloadPath
        .replace(/^images\//, 'thumbnails/')
        .replace(/\/images\//, '/thumbnails/')
        .replace(/\.[^/.]+$/, '.jpg');
      return thumbPath.endsWith(`/${safePath}`);
    }) || null;
  };

  fastify.get('/images/:file', async (request, reply) => serveAsset(request, reply, 'images'));
  fastify.get('/images/*', async (request, reply) => serveAsset(request, reply, 'images'));

  fastify.get('/thumbnails/:file', async (request, reply) => serveAsset(request, reply, 'thumbnails'));
  fastify.get('/thumbnails/*', async (request, reply) => serveAsset(request, reply, 'thumbnails'));

  fastify.get('/', async (request, reply) => {
    return { 
      message: 'Wallpaper Archive API (Serverless)',
      endpoints: {
        '/api/wallpapers': 'Get all wallpapers with optional filters',
        '/api/wallpapers/:id': 'Get specific wallpaper',
        '/api/stats': 'Get database statistics',
        '/api/arena/battle': 'Get random pair for arena',
        '/api/arena/leaderboard': 'Get arena leaderboard'
      }
    };
  });

  fastify.get('/api/resolutions', async (request, reply) => {
    try {
      const [resolutions, aspects] = await Promise.all([
        db.getUniqueResolutions(),
        db.getAspectBreakdown()
      ]);
      setCache(reply, 600);
      return { resolutions, aspects };
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch resolutions' });
    }
  });

  fastify.get('/api/stats', async (request, reply) => {
    try {
      const [
        baseStats,
        providerBreakdownRaw,
        folderBreakdownRaw,
        resolutionRows,
        fileSizeBuckets,
        aspectBreakdown,
        totalDownloads
      ] = await Promise.all([
        db.getStats(),
        db.getProviderBreakdown(),
        db.getFolderBreakdown(25),
        db.getUniqueResolutions(),
        db.getFileSizeBuckets(),
        db.getAspectBreakdown(),
        db.getDownloadTotals()
      ]);

      const providerBreakdown = providerBreakdownRaw.map((item) => ({
        ...item,
        count: Number(item.count || 0),
        total_size: Number(item.total_size || 0)
      }));

      const folderBreakdown = folderBreakdownRaw.map((item) => ({
        ...item,
        count: Number(item.count || 0),
        total_size: Number(item.total_size || 0)
      }));

      const totalWallpapers = Number(baseStats.total || 0);
      const totalSize = Number(baseStats.total_size || 0);
      const totalProviders = Number(baseStats.providers || 0);
      const totalFolders = Number(baseStats.folders || 0);

      const providerCounts = {};
      providerBreakdown.forEach((item) => { providerCounts[item.provider] = item.count; });

      const folderCounts = {};
      folderBreakdown.forEach((item) => { folderCounts[item.folder] = item.count; });

      const dimensions = {};
      resolutionRows.forEach((item) => { dimensions[item.dimensions] = item.count; });

      // Get file types from provider breakdown filenames in DB (faster than fetching all filenames)
      const file_types = {};

      const normalizedBuckets = {
        under_1mb: Number(fileSizeBuckets?.under_1mb || 0),
        between_1_5mb: Number(fileSizeBuckets?.between_1_5mb || 0),
        between_5_10mb: Number(fileSizeBuckets?.between_5_10mb || 0),
        over_10mb: Number(fileSizeBuckets?.over_10mb || 0)
      };

      setCache(reply, 120);

      return {
        total_wallpapers: totalWallpapers,
        total_size: totalSize,
        storage_size: totalSize,
        providers: totalProviders,
        folders: totalFolders,
        provider_counts: providerCounts,
        providers_breakdown: providerBreakdown,
        folder_counts: folderCounts,
        folder_breakdown: folderBreakdown,
        dimensions,
        file_types,
        file_size_buckets: normalizedBuckets,
        aspects: aspectBreakdown,
        total_downloads: totalDownloads
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  fastify.get('/api/providers', async (request, reply) => {
    try {
      const { providers: providerRows, folders: folderRows } = await db.getProvidersAndFolders();
      const providers = providerRows.map((provider) => {
        const lastUpdated = provider.last_created_at ? new Date(provider.last_created_at) : null;
        const daysSinceUpdate = lastUpdated
          ? Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        let status = 'unknown';
        if (daysSinceUpdate !== null) {
          if (daysSinceUpdate <= 1) status = 'active';
          else if (daysSinceUpdate <= 7) status = 'recent';
          else status = 'stale';
        }

        return {
          name: provider.provider,
          count: Number(provider.count || 0),
          lastUpdated,
          status,
          daysSinceUpdate
        };
      });

      const folders = folderRows.map((folder) => ({
        name: folder.folder,
        count: Number(folder.count || 0)
      }));
      
      setCache(reply, 600);

      return {
        success: true,
        providers,
        folders
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerPublicRoutes;
