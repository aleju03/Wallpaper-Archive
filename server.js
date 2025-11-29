const fastify = require('fastify')({ 
  logger: {
    level: 'warn'
  },
  disableRequestLogging: true
});
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const sharp = require('sharp');
const { S3Client, DeleteObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const Database = require('./database');
const { generatePerceptualHash, findDuplicateGroups } = require('./image-hash');

// Initialize database client
const db = new Database();

// Config for security/hardening
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10); // 120 requests/ip/minute
const RATE_LIMIT_DRIVER = (process.env.RATE_LIMIT_DRIVER || 'memory').toLowerCase();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const R2_ENABLED = !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_ENDPOINT);
const LOCAL_DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const LOCAL_THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
const STORAGE_MODE = R2_ENABLED ? 'r2' : 'local';

// Simple in-memory rate limiter (sufficient for small traffic/serverless; move to shared store if needed)
const rateBuckets = new Map();
const getClientId = (request) => {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.ip || 'unknown';
};

fastify.addHook('onRequest', async (request, reply) => {
  const now = Date.now();
  const clientId = getClientId(request);

  if (RATE_LIMIT_DRIVER === 'database') {
    try {
      const result = await db.consumeRateLimit(clientId, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
      if (!result.allowed) {
        reply.code(429).send({ success: false, error: 'Too many requests' });
        return;
      }
      reply.header('X-RateLimit-Reset', result.resetAt);
      return;
    } catch (error) {
      fastify.log.warn({ err: error }, 'Database rate limit failed, falling back to in-memory buckets');
    }
  }

  const bucket = rateBuckets.get(clientId) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };

  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateBuckets.set(clientId, bucket);

  if (bucket.count > RATE_LIMIT_MAX) {
    reply.code(429).send({ success: false, error: 'Too many requests' });
    return;
  }
});

// Basic helpers
const sanitizeFilename = (name = '') => name
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}._-]+/gu, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '');
const ensureDir = async (dirPath) => fsPromises.mkdir(dirPath, { recursive: true });
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
const guessMime = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

const r2Client = R2_ENABLED ? new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
}) : null;

const buildR2Url = (key) => `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;

// Calculate actual R2 bucket size (images + thumbnails)
const getR2BucketSize = async () => {
  if (!R2_ENABLED || !r2Client) return null;
  
  try {
    let totalSize = 0;
    let objectCount = 0;
    let continuationToken = null;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        ContinuationToken: continuationToken
      });
      
      const response = await r2Client.send(command);
      
      if (response.Contents) {
        for (const obj of response.Contents) {
          totalSize += obj.Size || 0;
          objectCount++;
        }
      }
      
      continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
    } while (continuationToken);
    
    return totalSize;
  } catch (error) {
    return null;
  }
};

const toSafeSlug = (value = '') => sanitizeFilename(value.toLowerCase().replace(/\s+/g, '-'));
const getGithubHeaders = () => {
  const headers = { 'User-Agent': 'WallpaperEngine' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
};
const fetchJson = async (url) => {
  const res = await fetch(url, { headers: getGithubHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
};

const fetchBuffer = async (url) => {
  const res = await fetch(url, { headers: getGithubHeaders() });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

const parseRepoUrl = (repoUrl) => {
  try {
    const url = new URL(repoUrl);
    const parts = url.pathname.replace(/^\/|\.git$/g, '').split('/');
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch (error) {
    return null;
  }
};

// Admin auth helper
const requireAdminKey = (request, reply) => {
  if (!ADMIN_API_KEY) {
    reply.code(500).send({ success: false, error: 'Admin key not configured' });
    return false;
  }
  const authHeader = request.headers['authorization'];
  const keyFromHeader = authHeader && authHeader.toLowerCase().startsWith('bearer ') 
    ? authHeader.slice(7)
    : null;
  const key = keyFromHeader || request.headers['x-admin-key'];
  if (key !== ADMIN_API_KEY) {
    reply.code(401).send({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
};

const adminAuthHook = async (request, reply) => {
  if (!requireAdminKey(request, reply)) {
    return reply;
  }
};

// Pagination + cache helpers
const normalizePagination = (limit, page, maxLimit = 100) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 0, 1), maxLimit);
  const safePage = Math.max(parseInt(page) || 1, 1);
  return { limit: safeLimit, page: safePage, offset: (safePage - 1) * safeLimit };
};

const setCache = (reply, seconds = 300) => {
  reply.header('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=60`);
};

const getKeyFromUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    const key = url.pathname.replace(/^\//, '');
    if (R2_BUCKET_NAME && key.startsWith(`${R2_BUCKET_NAME}/`)) {
      return key.slice(R2_BUCKET_NAME.length + 1);
    }
    return key;
  } catch {
    return null;
  }
};

const deleteFromR2 = async (keys = []) => {
  if (!R2_ENABLED || !r2Client) return;
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  for (const key of uniqueKeys) {
    try {
      await r2Client.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key
      }));
    } catch (error) {
      fastify.log.warn({ err: error, key }, 'Failed to delete object from R2');
    }
  }
};

const uploadToStorage = async (key, buffer, contentType = 'application/octet-stream', isThumbnail = false) => {
  if (R2_ENABLED && r2Client) {
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }));
    return buildR2Url(key);
  }

  // Local fallback storage
  const targetDir = isThumbnail ? LOCAL_THUMBNAILS_DIR : LOCAL_DOWNLOADS_DIR;
  await ensureDir(targetDir);
  const filename = path.basename(key);
  const targetPath = path.join(targetDir, filename);
  await fsPromises.writeFile(targetPath, buffer);
  return `/${isThumbnail ? 'thumbnails' : 'images'}/${filename}`;
};

const getImageBuffer = async (wallpaperOrUrl) => {
  const target = typeof wallpaperOrUrl === 'string' ? { download_url: wallpaperOrUrl } : wallpaperOrUrl;
  const localPath = target?.local_path;
  const filename = target?.filename;

  // Prefer local file if it exists
  const candidatePaths = [];
  if (localPath) {
    candidatePaths.push(path.isAbsolute(localPath) ? localPath : path.join(__dirname, localPath.replace(/^\.?\//, '')));
  }
  if (filename) {
    candidatePaths.push(path.join(LOCAL_DOWNLOADS_DIR, filename));
  }

  for (const candidate of candidatePaths) {
    try {
      const stats = await fsPromises.stat(candidate);
      if (stats.isFile()) {
        return fsPromises.readFile(candidate);
      }
    } catch {
      // Continue trying other options
    }
  }

  // Fallback to remote download
  const urlStr = target?.download_url;
  if (!urlStr) {
    throw new Error('No source available to fetch image buffer');
  }

  fastify.log.warn({
    filename: filename || null,
    localPathAttempted: candidatePaths.length > 0
  }, 'Falling back to remote image fetch');

  const downloader = urlStr.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    downloader.get(urlStr, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Unexpected status ${res.statusCode} when fetching ${urlStr}`));
        return;
      }
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', reject);
  });
};

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
    return downloadUrl;
  }
};

// Enable CORS
fastify.register(require('@fastify/cors'), {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    if (!ALLOWED_ORIGINS.length) return cb(null, true); // allow all if no list provided
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
});

fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB per file
  }
});

// Local file serving (for local storage mode)
fastify.get('/images/:file', async (request, reply) => {
  try {
    const safeName = sanitizeFilename(request.params.file);
    const filePath = path.join(LOCAL_DOWNLOADS_DIR, safeName);
    await fsPromises.access(filePath);
    const stream = fs.createReadStream(filePath);
    reply.header('Content-Type', guessMime(filePath));
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(stream);
  } catch (error) {
    reply.code(404);
    return { success: false, error: 'Image not found' };
  }
});

fastify.get('/thumbnails/:file', async (request, reply) => {
  try {
    const safeName = sanitizeFilename(request.params.file);
    const filePath = path.join(LOCAL_THUMBNAILS_DIR, safeName);
    await fsPromises.access(filePath);
    const stream = fs.createReadStream(filePath);
    reply.header('Content-Type', guessMime(filePath));
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(stream);
  } catch (error) {
    reply.code(404);
    return { success: false, error: 'Thumbnail not found' };
  }
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

fastify.get('/api/wallpapers', async (request, reply) => {
  try {
    const { provider, folder, search, resolution, aspect, limit = 50, page = 1 } = request.query;
    const { limit: safeLimit, page: safePage, offset } = normalizePagination(limit, page);
    
    const filters = {};
    if (provider) filters.provider = provider;
    if (folder) filters.folder = folder;
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
        image_url: w.download_url, // Use public URL directly
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

fastify.get('/api/stats', async (request, reply) => {
  try {
    const [
      baseStats,
      providerBreakdownRaw,
      folderBreakdownRaw,
      resolutionRows,
      fileSizeBuckets,
      filenames,
      r2BucketSize,
      aspectBreakdown,
      totalDownloads
    ] = await Promise.all([
      db.getStats(),
      db.getProviderBreakdown(),
      db.getFolderBreakdown(25),
      db.getUniqueResolutions(),
      db.getFileSizeBuckets(),
      db.getAllFilenames(),
      getR2BucketSize(),
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

    const file_types = {};
    filenames.forEach((name) => {
      const ext = path.extname(name || '').toLowerCase().replace('.', '');
      if (ext) {
        file_types[ext] = (file_types[ext] || 0) + 1;
      }
    });

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
      storage_size: r2BucketSize !== null ? r2BucketSize : totalSize,
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

// Arena endpoints
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
      image_url: wallpaper.download_url, // Use download_url assuming it maps to gitlab public url
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

// Admin: upload new wallpapers (stores file, thumbnail, DB row, and hash)
fastify.post('/api/upload', { onRequest: [adminAuthHook] }, async (request, reply) => {
  try {
    if (!requireAdminKey(request, reply)) return;

    const parts = request.parts();
    const formFields = {
      provider: null,
      folder: null,
      tags: null
    };
    const uploaded = [];
    const errors = [];
    const files = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        try {
          const originalName = sanitizeFilename(part.filename || `upload-${Date.now()}.jpg`);
          const buffer = await streamToBuffer(part.file);
          files.push({ originalName, buffer });
        } catch (error) {
          errors.push({ filename: part.filename, error: error.message });
        }
      } else if (part.type === 'field') {
        if (Object.prototype.hasOwnProperty.call(formFields, part.fieldname)) {
          formFields[part.fieldname] = part.value;
        }
      }
    }

    if (files.length === 0) {
      reply.code(400);
      return { success: false, error: 'No files received' };
    }

    for (const file of files) {
      try {
        const meta = await sharp(file.buffer).metadata();
        const dimensions = meta.width && meta.height ? `${meta.width}x${meta.height}` : null;
        const fileSize = file.buffer.length;
        const hash = await generatePerceptualHash(file.buffer);

        const timestamp = Date.now();
        const baseName = `${timestamp}-${file.originalName}`;
        const imageKey = `images/${baseName}`;
        const thumbKey = `thumbnails/${path.basename(baseName, path.extname(baseName))}.jpg`;

        // Upload original
        const downloadUrl = await uploadToStorage(imageKey, file.buffer, meta.format ? `image/${meta.format}` : 'application/octet-stream', false);

        // Upload thumbnail (JPEG)
        const thumbBuffer = await sharp(file.buffer)
          .resize({ width: 900, height: 900, fit: 'inside' })
          .jpeg({ quality: 82 })
          .toBuffer();
        const thumbUrl = await uploadToStorage(thumbKey, thumbBuffer, 'image/jpeg', true);

        const record = {
          filename: baseName,
          provider: formFields.provider || 'manual',
          folder: formFields.folder || null,
          file_size: fileSize,
          dimensions,
          download_url: downloadUrl,
          local_path: STORAGE_MODE === 'local' ? path.join('downloads', baseName) : null,
          tags: formFields.tags || null,
          perceptual_hash: hash
        };

        const insertedId = await db.insertWallpaper(record);
        uploaded.push({
          id: insertedId,
          filename: baseName,
          download_url: downloadUrl,
          thumbnail_url: thumbUrl,
          perceptual_hash: hash
        });
      } catch (error) {
        errors.push({ filename: file.originalName, error: error.message });
      }
    }

    return {
      success: errors.length === 0,
      uploaded,
      errors
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

// Admin: GitHub import preview (top-level folder strategy)
fastify.post('/api/import/repo/preview', { onRequest: [adminAuthHook] }, async (request, reply) => {
  try {
    if (!requireAdminKey(request, reply)) return;
    const { repoUrl, branch, limit = 10 } = request.body || {};
    const parsed = parseRepoUrl(repoUrl || '');
    if (!parsed) {
      reply.code(400);
      return { success: false, error: 'Invalid repo URL' };
    }

    const repoMeta = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    const branchName = branch || repoMeta.default_branch || 'main';

    const tree = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branchName}?recursive=1`);
    const files = (tree.tree || []).filter(item => item.type === 'blob' && item.path && item.path.match(/\.(jpg|jpeg|png|webp|gif)$/i));

    const byFolder = {};
    const samples = [];

    files.forEach((file) => {
      const parts = file.path.split('/');
      const folder = parts.length > 1 ? parts[0] : '';
      byFolder[folder] = (byFolder[folder] || 0) + 1;
    });

    files.slice(0, Math.max(1, Math.min(limit, 25))).forEach((file) => {
      const parts = file.path.split('/');
      const folder = parts.length > 1 ? parts[0] : '';
      samples.push({
        filename: path.basename(file.path),
        folder,
        path: file.path,
        size: file.size,
        raw_url: `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branchName}/${file.path}`
      });
    });

    return {
      success: true,
      provider_suggested: parsed.owner || parsed.repo,
      branch: branchName,
      total_images: files.length,
      by_folder: byFolder,
      sample: samples
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

// Admin: GitHub import (downloads -> hash -> thumbnail -> storage -> DB)
fastify.post('/api/import/repo/import', { onRequest: [adminAuthHook] }, async (request, reply) => {
  try {
    if (!requireAdminKey(request, reply)) return;
    const { repoUrl, branch, provider, folderStrategy = 'top-level' } = request.body || {};
    const parsed = parseRepoUrl(repoUrl || '');
    if (!parsed) {
      reply.code(400);
      return { success: false, error: 'Invalid repo URL' };
    }

    const repoMeta = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    const branchName = branch || repoMeta.default_branch || 'main';

    const tree = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branchName}?recursive=1`);
    const files = (tree.tree || []).filter(item => item.type === 'blob' && item.path && item.path.match(/\.(jpg|jpeg|png|webp|gif)$/i));

    const providerName = provider || parsed.repo;
    const providerSlug = toSafeSlug(providerName) || 'repo';
    const results = { imported: [], skipped: [], failed: [] };

    for (const file of files) {
      try {
        const parts = file.path.split('/');
        const folder = parts.length > 1 ? parts[0] : '';
        const filename = path.basename(file.path);
        const finalFolder = folderStrategy === 'top-level' ? folder || null : null;

        // Skip if already in DB
        const existing = await db.getWallpapers({ provider: providerName, folder: finalFolder, filename });
        if (existing.length > 0) {
          results.skipped.push({ filename, reason: 'exists' });
          continue;
        }

        const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branchName}/${file.path}`;
        const buffer = await fetchBuffer(rawUrl);
        const meta = await sharp(buffer).metadata();
        const dimensions = meta.width && meta.height ? `${meta.width}x${meta.height}` : null;
        const fileSize = buffer.length;
        const hash = await generatePerceptualHash(buffer);

        const safeFolder = finalFolder ? toSafeSlug(finalFolder) : '';
        const uniqueName = `${Date.now()}-${sanitizeFilename(filename)}`;
        const imageKey = `images/${providerSlug}${safeFolder ? `/${safeFolder}` : ''}/${uniqueName}`;
        const thumbKey = `thumbnails/${providerSlug}${safeFolder ? `/${safeFolder}` : ''}/${path.basename(uniqueName, path.extname(uniqueName))}.jpg`;

        const downloadUrl = await uploadToStorage(imageKey, buffer, meta.format ? `image/${meta.format}` : 'application/octet-stream', false);
        const thumbBuffer = await sharp(buffer).resize({ width: 900, height: 900, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
        const thumbUrl = await uploadToStorage(thumbKey, thumbBuffer, 'image/jpeg', true);

        const record = {
          filename,
          provider: providerName,
          folder: finalFolder,
          file_size: fileSize,
          dimensions,
          download_url: downloadUrl,
          local_path: STORAGE_MODE === 'local' ? path.join('downloads', path.basename(imageKey)) : null,
          tags: finalFolder ? `["${finalFolder}"]` : null,
          perceptual_hash: hash
        };

        const insertedId = await db.insertWallpaper(record);
        results.imported.push({
          id: insertedId,
          filename,
          folder: finalFolder,
          download_url: downloadUrl,
          thumbnail_url: thumbUrl
        });
      } catch (error) {
        results.failed.push({ filename: file.path, error: error.message });
      }
    }

    return { success: true, ...results };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

// Admin: duplicate detection helpers
fastify.get('/api/duplicates/status', { onRequest: [adminAuthHook] }, async (request, reply) => {
  try {
    if (!requireAdminKey(request, reply)) return;
    const status = await db.getHashStatus();
    setCache(reply, 60);
    return { success: true, status };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

fastify.get('/api/duplicates', { onRequest: [adminAuthHook] }, async (request, reply) => {
  try {
    if (!requireAdminKey(request, reply)) return;
    const threshold = Math.max(1, Math.min(parseInt(request.query.threshold) || 10, 64));
    const wallpapers = await db.getAllWallpapersWithHashes();
    const duplicateGroups = findDuplicateGroups(wallpapers, threshold).map(group => 
      group.map(w => ({
        ...w,
        image_url: w.download_url,
        thumbnail_url: buildThumbnailUrl(w.download_url)
      }))
    );

    setCache(reply, 60);

    return {
      success: true,
      duplicateGroups,
      totalGroups: duplicateGroups.length,
      totalDuplicates: duplicateGroups.reduce((sum, group) => sum + group.length, 0)
    };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

fastify.post('/api/duplicates/generate-hashes', { onRequest: [adminAuthHook] }, async (request, reply) => {
  try {
    if (!requireAdminKey(request, reply)) return;
    const missing = await db.getAllWallpapersWithoutHashes();
    let updated = 0;
    const failed = [];

    for (const wallpaper of missing) {
      try {
        const buffer = await getImageBuffer(wallpaper);
        const hash = await generatePerceptualHash(buffer);
        await db.updatePerceptualHash(wallpaper.id, hash);
        updated += 1;
      } catch (error) {
        failed.push({ id: wallpaper.id, error: error.message });
      }
    }

    return { success: true, processed: missing.length, updated, failed };
  } catch (error) {
    reply.code(500);
    return { success: false, error: error.message };
  }
});

// Admin: delete wallpaper (optional R2 delete)
fastify.delete('/api/wallpapers/:id', { onRequest: [adminAuthHook] }, async (request, reply) => {
  try {
    if (!requireAdminKey(request, reply)) return;

    const { deleteFile } = request.query;
    const wallpaper = await db.getWallpaperById(request.params.id);

    if (!wallpaper) {
      reply.code(404);
      return { success: false, error: 'Wallpaper not found' };
    }

    if (deleteFile === 'true') {
      const mainKey = getKeyFromUrl(wallpaper.download_url);
      const thumbUrl = buildThumbnailUrl(wallpaper.download_url);
      const thumbKey = thumbUrl ? getKeyFromUrl(thumbUrl) : null;
      await deleteFromR2([mainKey, thumbKey]);
    }

    const deleted = await db.deleteWallpaper(wallpaper.id);
    if (!deleted) {
      reply.code(500);
      return { success: false, error: 'Failed to delete wallpaper' };
    }

    return { success: true, deleted: wallpaper.id, removedFromStorage: deleteFile === 'true' && R2_ENABLED };
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
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  start();
}
