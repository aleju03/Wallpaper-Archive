require('dotenv').config();
const path = require('path');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const RATE_LIMIT_DRIVER = (process.env.RATE_LIMIT_DRIVER || 'memory').toLowerCase();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// R2/Storage config
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // Public access URL (custom domain or pub-xxx.r2.dev)
const R2_ENABLED = !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_ENDPOINT);

// Directory paths
const ROOT_DIR = path.join(__dirname, '..', '..');
const LOCAL_DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const LOCAL_THUMBNAILS_DIR = path.join(ROOT_DIR, 'thumbnails');
const STORAGE_MODE = R2_ENABLED ? 'r2' : 'local';

module.exports = {
  ALLOWED_ORIGINS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_DRIVER,
  ADMIN_API_KEY,
  GITHUB_TOKEN,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ACCOUNT_ID,
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_PUBLIC_URL,
  R2_ENABLED,
  ROOT_DIR,
  LOCAL_DOWNLOADS_DIR,
  LOCAL_THUMBNAILS_DIR,
  STORAGE_MODE
};
