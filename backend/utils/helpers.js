const path = require('path');
const fsPromises = require('fs/promises');

/**
 * Sanitize filename to prevent directory traversal and other security issues
 */
const sanitizeFilename = (name = '') => name
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}._-]+/gu, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '');

/**
 * Create directory recursively if it doesn't exist
 */
const ensureDir = async (dirPath) => fsPromises.mkdir(dirPath, { recursive: true });

/**
 * Convert a readable stream to buffer
 */
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

/**
 * Guess MIME type from file path
 */
const guessMime = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

/**
 * Convert string to URL-safe slug
 */
const toSafeSlug = (value = '') => sanitizeFilename(value.toLowerCase().replace(/\s+/g, '-'));

/**
 * Normalize pagination parameters
 */
const normalizePagination = (limit, page, maxLimit = 100) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 0, 1), maxLimit);
  const safePage = Math.max(parseInt(page) || 1, 1);
  return { limit: safeLimit, page: safePage, offset: (safePage - 1) * safeLimit };
};

/**
 * Set cache control header
 */
const setCache = (reply, seconds = 300) => {
  reply.header('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=60`);
};

/**
 * Build thumbnail URL from the public download URL
 */
const buildThumbnailUrl = (downloadUrl) => {
  if (!downloadUrl) return null;

  try {
    const url = new URL(downloadUrl, 'http://thumbnail-helper.local');
    const isRelative = url.origin === 'http://thumbnail-helper.local';
    const originalPath = url.pathname || '';

    let thumbPath = originalPath.includes('/images/')
      ? originalPath.replace('/images/', '/thumbnails/')
      : `/thumbnails/${originalPath.replace(/^\//, '')}`;

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

/**
 * Parse GitHub repository URL
 */
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

/**
 * Get GitHub API headers with optional authentication
 */
const getGithubHeaders = (githubToken) => {
  const headers = { 'User-Agent': 'WallpaperEngine' };
  if (githubToken) {
    headers.Authorization = `token ${githubToken}`;
  }
  return headers;
};

/**
 * Fetch JSON from URL with GitHub headers
 */
const fetchJson = async (url, githubToken) => {
  const res = await fetch(url, { headers: getGithubHeaders(githubToken) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
};

/**
 * Fetch buffer from URL with GitHub headers
 */
const fetchBuffer = async (url, githubToken) => {
  const res = await fetch(url, { headers: getGithubHeaders(githubToken) });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

module.exports = {
  sanitizeFilename,
  ensureDir,
  streamToBuffer,
  guessMime,
  toSafeSlug,
  normalizePagination,
  setCache,
  buildThumbnailUrl,
  parseRepoUrl,
  getGithubHeaders,
  fetchJson,
  fetchBuffer
};
