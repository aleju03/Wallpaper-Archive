const fastify = require('fastify')({ 
  logger: {
    level: 'warn'
  },
  disableRequestLogging: true
});
const path = require('path');
const Database = require('./database');

// Initialize database client
const db = new Database();

// Helper to build the expected thumbnail URL from the public download URL
const buildThumbnailUrl = (downloadUrl) => {
  if (!downloadUrl) return null;

  try {
    const url = new URL(downloadUrl, 'http://thumbnail-helper.local');
    const isRelative = url.origin === 'http://thumbnail-helper.local';
    const originalPath = url.pathname || '';

    // Swap the folder to /thumbnails/ (fallback to prefixing if /images/ is missing)
    let thumbPath = originalPath.includes('/images/')
      ? originalPath.replace('/images/', '/thumbnails/')
      : `/thumbnails/${originalPath.replace(/^\//, '')}`;

    // Normalize extension to .jpg (avoid double .jpg endings)
    if (thumbPath.match(/\.[^/.]+$/)) {
      thumbPath = thumbPath.replace(/\.[^/.]+$/, '.jpg');
    } else if (!thumbPath.endsWith('.jpg')) {
      thumbPath = `${thumbPath}.jpg`;
    }

    url.pathname = thumbPath;
    return isRelative ? url.pathname : url.toString();
  } catch (error) {
    console.warn('Failed to build thumbnail URL for', downloadUrl, error);
    return downloadUrl;
  }
};

// Enable CORS
fastify.register(require('@fastify/cors'), {
  origin: ['*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
});

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
    const resolutions = await db.getUniqueResolutions();
    return { resolutions };
  } catch (error) {
    console.error('Error fetching resolutions:', error);
    return reply.status(500).send({ error: 'Failed to fetch resolutions' });
  }
});

fastify.get('/api/wallpapers', async (request, reply) => {
  try {
    const { provider, folder, search, resolution, limit = 50, page = 1 } = request.query;
    
    const filters = {};
    if (provider) filters.provider = provider;
    if (folder) filters.folder = folder;
    if (search) filters.search = search;
    if (resolution) filters.resolution = resolution;
    filters.limit = parseInt(limit);
    filters.offset = (parseInt(page) - 1) * parseInt(limit);

    const [wallpapers, total] = await Promise.all([
      db.getWallpapers(filters),
      db.getWallpapersCount(filters)
    ]);
    
    const currentPage = parseInt(page);
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = currentPage < totalPages;
    
    return {
      wallpapers: wallpapers.map(w => ({
        ...w,
        filename: w.filename,
        image_url: w.download_url, // Use public URL directly
        thumbnail_url: buildThumbnailUrl(w.download_url)
      })),
      total: total,
      page: currentPage,
      limit: parseInt(limit),
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

fastify.get('/api/stats', async (request, reply) => {
  try {
    const stats = await db.getStats();
    
    // Get all wallpapers to calculate additional stats
    // Note: In serverless, fetching ALL rows might be slow/expensive.
    // Optimizing to only fetch what is needed or simplified stats.
    const wallpapers = await db.getWallpapers({ limit: 10000 }); // Soft limit
    
    // Calculate providers and folders
    const providers = {};
    const folders = {};
    const dimensions = {};
    const file_types = {};
    let total_size = 0;
    
    wallpapers.forEach(w => {
      // Providers
      providers[w.provider] = (providers[w.provider] || 0) + 1;
      
      // Folders
      if (w.folder) {
        folders[w.folder] = (folders[w.folder] || 0) + 1;
      }
      
      // Dimensions
      if (w.dimensions) {
        dimensions[w.dimensions] = (dimensions[w.dimensions] || 0) + 1;
      }
      
      // File types (from filename extension)
      if (w.filename) {
        const ext = path.extname(w.filename).toLowerCase().replace('.', '');
        if (ext) {
          file_types[ext] = (file_types[ext] || 0) + 1;
        }
      }
      
      // Total size
      if (w.file_size) {
        total_size += parseInt(w.file_size) || 0;
      }
    });
    
    return {
      total_wallpapers: wallpapers.length,
      total_size,
      providers,
      folders,
      dimensions,
      file_types,
      ...stats
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

fastify.get('/api/providers', async (request, reply) => {
  try {
    // Optimized to not fetch all rows if possible, but reusing existing logic for now
    const wallpapers = await db.getWallpapers({ limit: 5000 });
    const folders = [...new Set(wallpapers.map(w => w.folder).filter(Boolean))];
    
    const providerStats = {};
    wallpapers.forEach(wallpaper => {
      if (!providerStats[wallpaper.provider]) {
        providerStats[wallpaper.provider] = {
          name: wallpaper.provider,
          count: 0,
          lastUpdated: null
        };
      }
      providerStats[wallpaper.provider].count++;
      
      const wallpaperDate = new Date(wallpaper.created_at);
      if (!providerStats[wallpaper.provider].lastUpdated || 
          wallpaperDate > providerStats[wallpaper.provider].lastUpdated) {
        providerStats[wallpaper.provider].lastUpdated = wallpaperDate;
      }
    });
    
    const providers = Object.values(providerStats).map(provider => {
      const daysSinceUpdate = provider.lastUpdated ? 
        Math.floor((new Date() - provider.lastUpdated) / (1000 * 60 * 60 * 24)) : null;
      
      let status = 'unknown';
      if (daysSinceUpdate !== null) {
        if (daysSinceUpdate <= 1) status = 'active';
        else if (daysSinceUpdate <= 7) status = 'recent';
        else status = 'stale';
      }
      
      return {
        ...provider,
        status,
        daysSinceUpdate
      };
    });
    
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

// Arena endpoints
fastify.get('/api/arena/battle', async (request, reply) => {
  try {
    const wallpapers = await db.getRandomWallpaperPair();
    
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
    const getBottom = request.query.bottom === 'true';
    const leaderboard = await db.getLeaderboard(limit, getBottom);
    const totalCount = await db.getTotalWallpaperCount();
    
    
    // Add image and thumbnail URLs
    const leaderboardWithUrls = leaderboard.map(wallpaper => ({
      ...wallpaper,
      image_url: wallpaper.download_url, // Use download_url assuming it maps to gitlab public url
      thumbnail_url: buildThumbnailUrl(wallpaper.download_url)
    }));

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
      console.log('Server running on http://localhost:3000');
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  start();
}
