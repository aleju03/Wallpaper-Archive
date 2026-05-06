const { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fsPromises = require('fs/promises');
const path = require('path');
const config = require('../config');
const { ensureDir } = require('../utils/helpers');

// Initialize Backblaze B2 S3-compatible client if enabled
const storageClient = config.B2_ENABLED ? new S3Client({
  region: config.B2_REGION,
  endpoint: config.B2_ENDPOINT,
  credentials: {
    accessKeyId: config.B2_KEY_ID,
    secretAccessKey: config.B2_APPLICATION_KEY
  }
}) : null;

/**
 * Build storage URL for a given key
 * Uses public URL if configured, otherwise falls back to S3 endpoint
 */
const buildStorageUrl = (key) => {
  if (config.B2_PUBLIC_URL) {
    return `${config.B2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
  return `${config.B2_ENDPOINT.replace(/\/$/, '')}/${config.B2_BUCKET_NAME}/${key}`;
};

/**
 * Get key from URL string
 */
const getKeyFromUrl = (urlStr) => {
  if (!urlStr) return null;

  try {
    const url = new URL(urlStr, 'http://storage.local');
    const key = url.pathname.replace(/^\//, '');
    if (config.B2_BUCKET_NAME && key.startsWith(`${config.B2_BUCKET_NAME}/`)) {
      return key.slice(config.B2_BUCKET_NAME.length + 1);
    }
    return key;
  } catch {
    return null;
  }
};

/**
 * Build an app-served URL so private storage can stay private.
 */
const buildClientAssetUrl = (storageUrl, fallbackFilename, type = 'images') => {
  const key = getKeyFromUrl(storageUrl);
  if (key) {
    if (key.startsWith('images/') || key.startsWith('thumbnails/')) {
      return `/${key}`;
    }
    return `/${type}/${key}`;
  }
  return fallbackFilename ? `/${type}/${fallbackFilename}` : storageUrl;
};

const buildClientImageUrl = (wallpaper) => buildClientAssetUrl(wallpaper?.download_url, wallpaper?.filename, 'images');

const buildClientThumbnailUrl = (wallpaper) => {
  const imageKey = getKeyFromUrl(wallpaper?.download_url);
  if (imageKey) {
    let thumbKey = imageKey.includes('/images/')
      ? imageKey.replace('/images/', '/thumbnails/')
      : imageKey.replace(/^images\//, 'thumbnails/');

    if (!thumbKey.startsWith('thumbnails/')) {
      thumbKey = `thumbnails/${thumbKey}`;
    }

    thumbKey = thumbKey.match(/\.[^/.]+$/)
      ? thumbKey.replace(/\.[^/.]+$/, '.jpg')
      : `${thumbKey}.jpg`;

    return `/${thumbKey}`;
  }

  return wallpaper?.filename ? `/thumbnails/${path.basename(wallpaper.filename, path.extname(wallpaper.filename))}.jpg` : null;
};

/**
 * Calculate actual storage bucket size (images + thumbnails)
 */
const getStorageBucketSize = async () => {
  if (!config.B2_ENABLED || !storageClient) return null;
  
  try {
    let totalSize = 0;
    let objectCount = 0;
    let continuationToken = null;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: config.B2_BUCKET_NAME,
        ContinuationToken: continuationToken
      });
      
      const response = await storageClient.send(command);
      
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

/**
 * Delete objects from storage
 */
const deleteFromStorage = async (keys = [], logger = console) => {
  if (!config.B2_ENABLED || !storageClient) return;
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  for (const key of uniqueKeys) {
    try {
      await storageClient.send(new DeleteObjectCommand({
        Bucket: config.B2_BUCKET_NAME,
        Key: key
      }));
    } catch (error) {
      logger.warn({ err: error, key }, 'Failed to delete object from storage');
    }
  }
};

/**
 * Upload file to storage (Backblaze B2 or local)
 */
const uploadToStorage = async (key, buffer, contentType = 'application/octet-stream', isThumbnail = false) => {
  if (config.B2_ENABLED && storageClient) {
    await storageClient.send(new PutObjectCommand({
      Bucket: config.B2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }));
    return buildStorageUrl(key);
  }

  // Local fallback storage
  const targetDir = isThumbnail ? config.LOCAL_THUMBNAILS_DIR : config.LOCAL_DOWNLOADS_DIR;
  await ensureDir(targetDir);
  const filename = path.basename(key);
  const targetPath = path.join(targetDir, filename);
  await fsPromises.writeFile(targetPath, buffer);
  return `/${isThumbnail ? 'thumbnails' : 'images'}/${filename}`;
};

const getObjectFromStorage = async (key) => {
  if (!config.B2_ENABLED || !storageClient) return null;

  const response = await storageClient.send(new GetObjectCommand({
    Bucket: config.B2_BUCKET_NAME,
    Key: key
  }));

  return {
    body: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength
  };
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

/**
 * Get image buffer from wallpaper (local or remote)
 */
const getImageBuffer = async (wallpaperOrUrl, logger = console) => {
  const target = typeof wallpaperOrUrl === 'string' ? { download_url: wallpaperOrUrl } : wallpaperOrUrl;
  const localPath = target?.local_path;
  const filename = target?.filename;

  // Prefer local file if it exists
  const candidatePaths = [];
  if (localPath) {
    candidatePaths.push(path.isAbsolute(localPath) ? localPath : path.join(config.ROOT_DIR, localPath.replace(/^\.?\//, '')));
  }
  if (filename) {
    candidatePaths.push(path.join(config.LOCAL_DOWNLOADS_DIR, filename));
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

  const key = getKeyFromUrl(target?.download_url);
  if (key && config.B2_ENABLED && storageClient) {
    const object = await getObjectFromStorage(key);
    return streamToBuffer(object.body);
  }

  // Fallback to remote download
  const urlStr = target?.download_url;
  if (!urlStr) {
    throw new Error('No source available to fetch image buffer');
  }

  logger.warn({
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

module.exports = {
  storageClient,
  buildStorageUrl,
  buildClientAssetUrl,
  buildClientImageUrl,
  buildClientThumbnailUrl,
  getKeyFromUrl,
  getStorageBucketSize,
  deleteFromStorage,
  uploadToStorage,
  getObjectFromStorage,
  getImageBuffer
};
