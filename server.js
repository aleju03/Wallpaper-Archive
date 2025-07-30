const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const Database = require('./database');

const db = new Database();

fastify.register(require('@fastify/cors'), {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
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
    const providers = [...new Set(wallpapers.map(w => w.provider))];
    const folders = [...new Set(wallpapers.map(w => w.folder).filter(Boolean))];
    
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