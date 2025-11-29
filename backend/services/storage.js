const { S3Client, DeleteObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fsPromises = require('fs/promises');
const path = require('path');
const config = require('../config');
const { ensureDir } = require('../utils/helpers');

// Initialize R2 client if enabled
const r2Client = config.R2_ENABLED ? new S3Client({
  region: 'auto',
  endpoint: config.R2_ENDPOINT,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY
  }
}) : null;

/**
 * Build R2 URL for a given key
 */
const buildR2Url = (key) => `${config.R2_ENDPOINT}/${config.R2_BUCKET_NAME}/${key}`;

/**
 * Get key from URL string
 */
const getKeyFromUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    const key = url.pathname.replace(/^\//, '');
    if (config.R2_BUCKET_NAME && key.startsWith(`${config.R2_BUCKET_NAME}/`)) {
      return key.slice(config.R2_BUCKET_NAME.length + 1);
    }
    return key;
  } catch {
    return null;
  }
};

/**
 * Calculate actual R2 bucket size (images + thumbnails)
 */
const getR2BucketSize = async () => {
  if (!config.R2_ENABLED || !r2Client) return null;
  
  try {
    let totalSize = 0;
    let objectCount = 0;
    let continuationToken = null;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: config.R2_BUCKET_NAME,
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

/**
 * Delete objects from R2
 */
const deleteFromR2 = async (keys = [], logger = console) => {
  if (!config.R2_ENABLED || !r2Client) return;
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  for (const key of uniqueKeys) {
    try {
      await r2Client.send(new DeleteObjectCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key
      }));
    } catch (error) {
      logger.warn({ err: error, key }, 'Failed to delete object from R2');
    }
  }
};

/**
 * Upload file to storage (R2 or local)
 */
const uploadToStorage = async (key, buffer, contentType = 'application/octet-stream', isThumbnail = false) => {
  if (config.R2_ENABLED && r2Client) {
    await r2Client.send(new PutObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }));
    return buildR2Url(key);
  }

  // Local fallback storage
  const targetDir = isThumbnail ? config.LOCAL_THUMBNAILS_DIR : config.LOCAL_DOWNLOADS_DIR;
  await ensureDir(targetDir);
  const filename = path.basename(key);
  const targetPath = path.join(targetDir, filename);
  await fsPromises.writeFile(targetPath, buffer);
  return `/${isThumbnail ? 'thumbnails' : 'images'}/${filename}`;
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
  r2Client,
  buildR2Url,
  getKeyFromUrl,
  getR2BucketSize,
  deleteFromR2,
  uploadToStorage,
  getImageBuffer
};
