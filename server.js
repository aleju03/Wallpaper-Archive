const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const Database = require('./database');
const { generatePerceptualHash, findDuplicateGroups } = require('./image-hash');

const db = new Database();

// Cache for duplicate detection results
let duplicateCache = {
  lastComputed: null,
  results: null,
  wallpaperCount: 0
};

// Invalidate cache on startup to use hybrid algorithm
duplicateCache.lastComputed = null;

fastify.register(require('@fastify/cors'), {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'downloads'),
  prefix: '/images/',
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'thumbnails'),
  prefix: '/thumbnails/',
  decorateReply: false
});

async function generateThumbnail(imagePath, thumbnailPath) {
  try {
    await sharp(imagePath)
      .resize(300, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    return true;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return false;
  }
}

fastify.get('/', async (request, reply) => {
  return { 
    message: 'Wallpaper Engine API',
    endpoints: {
      '/api/wallpapers': 'Get all wallpapers with optional filters',
      '/api/wallpapers/:id': 'Get specific wallpaper',
      '/api/stats': 'Get database statistics',
      '/images/:filename': 'Serve original images',
      '/thumbnails/:filename': 'Serve thumbnail images'
    }
  };
});

fastify.get('/api/wallpapers', async (request, reply) => {
  try {
    const { provider, folder, search, limit, offset } = request.query;
    
    const filters = {};
    if (provider) filters.provider = provider;
    if (folder) filters.folder = folder;
    if (search) filters.search = search;
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const [wallpapers, total] = await Promise.all([
      db.getWallpapers(filters),
      db.getWallpapersCount(filters)
    ]);
    
    return {
      success: true,
      count: wallpapers.length,
      total: total,
      wallpapers: wallpapers.map(w => ({
        ...w,
        image_url: `/images/${path.basename(w.local_path)}`,
        thumbnail_url: `/thumbnails/${path.basename(w.local_path, path.extname(w.local_path))}.jpg`
      }))
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
        image_url: `/images/${path.basename(wallpaper.local_path)}`,
        thumbnail_url: `/thumbnails/${path.basename(wallpaper.local_path, path.extname(wallpaper.local_path))}.jpg`
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
    return { success: true, stats };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

fastify.get('/thumbnails/:filename', async (request, reply) => {
  const filename = request.params.filename;
  const thumbnailPath = path.join(__dirname, 'thumbnails', filename);
  
  try {
    await fs.access(thumbnailPath);
    return reply.sendFile(filename, path.join(__dirname, 'thumbnails'));
  } catch (error) {
    const originalFilename = filename.replace('.jpg', '');
    const wallpapers = await db.getWallpapers({ search: originalFilename });
    
    if (wallpapers.length > 0) {
      const wallpaper = wallpapers[0];
      const success = await generateThumbnail(wallpaper.local_path, thumbnailPath);
      
      if (success) {
        return reply.sendFile(filename, path.join(__dirname, 'thumbnails'));
      }
    }
    
    reply.code(404);
    return { error: 'Thumbnail not found' };
  }
});

fastify.get('/api/providers', async (request, reply) => {
  try {
    const wallpapers = await db.getWallpapers();
    const folders = [...new Set(wallpapers.map(w => w.folder).filter(Boolean))];
    
    // Group wallpapers by provider and calculate stats
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
      
      // Track the most recent wallpaper date for this provider
      const wallpaperDate = new Date(wallpaper.created_at || wallpaper.downloaded_at);
      if (!providerStats[wallpaper.provider].lastUpdated || 
          wallpaperDate > providerStats[wallpaper.provider].lastUpdated) {
        providerStats[wallpaper.provider].lastUpdated = wallpaperDate;
      }
    });
    
    // Convert to array and add status based on recent activity
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

// Generate perceptual hashes for images that don't have them
fastify.post('/api/duplicates/generate-hashes', async (request, reply) => {
  try {
    const wallpapers = await db.getAllWallpapersWithoutHashes();
    let processed = 0;
    let errors = 0;
    
    console.log(`Starting hash generation for ${wallpapers.length} wallpapers...`);
    
    for (const wallpaper of wallpapers) {
      try {
        if (wallpaper.local_path && await fs.access(wallpaper.local_path).then(() => true).catch(() => false)) {
          const hash = await generatePerceptualHash(wallpaper.local_path);
          await db.updatePerceptualHash(wallpaper.id, hash);
          processed++;
          
          if (processed % 10 === 0) {
            console.log(`Processed ${processed}/${wallpapers.length} hashes...`);
          }
        } else {
          console.log(`File not found: ${wallpaper.local_path}`);
          errors++;
        }
      } catch (error) {
        console.error(`Error processing ${wallpaper.filename}:`, error);
        errors++;
      }
    }
    
    return {
      success: true,
      message: `Hash generation complete. Processed: ${processed}, Errors: ${errors}`
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

// Find duplicate wallpapers
fastify.get('/api/duplicates', async (request, reply) => {
  try {
    const startTime = Date.now();
    console.log('🔍 DUPLICATES REQUEST START');
    
    const { threshold = 10 } = request.query;
    
    // Check if we can use cached results first (before expensive DB query)
    const cacheAge = duplicateCache.lastComputed ? Date.now() - duplicateCache.lastComputed : Infinity;
    console.log(`⏰ Cache age: ${Math.round(cacheAge/1000)}s, threshold: ${threshold}, cached threshold: ${duplicateCache.threshold}`);
    
    // Use cache if it's less than 5 minutes old and same threshold
    if (duplicateCache.results && 
        duplicateCache.threshold === parseInt(threshold) &&
        cacheAge < 5 * 60 * 1000) {
      console.log('✅ Using cached duplicate results (fast path)');
      
      const urlStartTime = Date.now();
      // Add image URLs to cached results
      const enhancedGroups = duplicateCache.results.map(group => 
        group.map(wallpaper => ({
          ...wallpaper,
          image_url: `/images/${path.basename(wallpaper.local_path)}`,
          thumbnail_url: `/thumbnails/${path.basename(wallpaper.local_path, path.extname(wallpaper.local_path))}.jpg`
        }))
      );
      console.log(`🔗 URL processing took: ${Date.now() - urlStartTime}ms`);
      
      const totalTime = Date.now() - startTime;
      console.log(`⚡ FAST PATH TOTAL TIME: ${totalTime}ms`);
      
      return {
        success: true,
        duplicateGroups: enhancedGroups,
        totalGroups: enhancedGroups.length,
        totalDuplicates: enhancedGroups.reduce((sum, group) => sum + group.length, 0)
      };
    }
    
    // Only fetch all wallpapers if cache is invalid
    console.log('❌ Cache miss - fetching wallpapers and computing duplicates...');
    
    const dbStartTime = Date.now();
    const wallpapers = await db.getAllWallpapersWithHashes();
    console.log(`📊 DB fetch took: ${Date.now() - dbStartTime}ms for ${wallpapers.length} wallpapers`);
    
    if (wallpapers.length === 0) {
      return {
        success: true,
        message: 'No wallpapers with hashes found. Generate hashes first.',
        duplicateGroups: []
      };
    }
    
    const computeStartTime = Date.now();
    console.log(`🧮 Computing duplicates for ${wallpapers.length} wallpapers with threshold ${threshold}...`);
    const duplicateGroups = findDuplicateGroups(wallpapers, parseInt(threshold));
    console.log(`🧮 Duplicate computation took: ${Date.now() - computeStartTime}ms`);
    
    // Update cache
    duplicateCache = {
      lastComputed: Date.now(),
      results: duplicateGroups,
      wallpaperCount: wallpapers.length,
      threshold: parseInt(threshold)
    };
    
    const urlStartTime = Date.now();
    // Add image URLs to each wallpaper in the groups
    const enhancedGroups = duplicateGroups.map(group => 
      group.map(wallpaper => ({
        ...wallpaper,
        image_url: `/images/${path.basename(wallpaper.local_path)}`,
        thumbnail_url: `/thumbnails/${path.basename(wallpaper.local_path, path.extname(wallpaper.local_path))}.jpg`
      }))
    );
    console.log(`🔗 URL processing took: ${Date.now() - urlStartTime}ms`);
    
    const totalTime = Date.now() - startTime;
    console.log(`🐌 SLOW PATH TOTAL TIME: ${totalTime}ms`);
    
    return {
      success: true,
      duplicateGroups: enhancedGroups,
      totalGroups: enhancedGroups.length,
      totalDuplicates: enhancedGroups.reduce((sum, group) => sum + group.length, 0)
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

// Delete a wallpaper (for removing duplicates)
fastify.delete('/api/wallpapers/:id', async (request, reply) => {
  try {
    const wallpaper = await db.getWallpaperById(request.params.id);
    
    if (!wallpaper) {
      reply.code(404);
      return { success: false, error: 'Wallpaper not found' };
    }
    
    // Delete the database record
    await db.deleteWallpaper(request.params.id);
    
    // Invalidate duplicate cache since data changed
    duplicateCache.lastComputed = null;
    
    // Optionally delete the physical file
    if (request.query.deleteFile === 'true' && wallpaper.local_path) {
      try {
        await fs.unlink(wallpaper.local_path);
        
        // Also try to delete the thumbnail
        const thumbnailPath = path.join(__dirname, 'thumbnails', 
          path.basename(wallpaper.local_path, path.extname(wallpaper.local_path)) + '.jpg');
        await fs.unlink(thumbnailPath).catch(() => {}); // Ignore if thumbnail doesn't exist
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
        // Continue anyway - database record is already deleted
      }
    }
    
    return {
      success: true,
      message: 'Wallpaper deleted successfully'
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

// Get hash generation status
fastify.get('/api/duplicates/status', async (request, reply) => {
  try {
    const [withHashes, withoutHashes, total] = await Promise.all([
      db.getAllWallpapersWithHashes(),
      db.getAllWallpapersWithoutHashes(),
      db.getWallpapersCount()
    ]);
    
    return {
      success: true,
      status: {
        total: total,
        withHashes: withHashes.length,
        withoutHashes: withoutHashes.length,
        percentage: total > 0 ? Math.round((withHashes.length / total) * 100) : 0
      }
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

const start = async () => {
  try {
    await fs.mkdir('./thumbnails', { recursive: true });
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();