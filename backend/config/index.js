require('dotenv').config();
const path = require('path');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const RATE_LIMIT_DRIVER = (process.env.RATE_LIMIT_DRIVER || 'memory').toLowerCase();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// JWT Authentication
const JWT_SECRET = process.env.JWT_SECRET || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

// Backblaze B2 S3-compatible storage config
const B2_KEY_ID = process.env.B2_KEY_ID || process.env.BACKBLAZE_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || process.env.BACKBLAZE_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || process.env.BACKBLAZE_BUCKET_NAME || 'wallpaper-archive';
const B2_ENDPOINT = process.env.B2_ENDPOINT || process.env.BACKBLAZE_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';
const B2_REGION = process.env.B2_REGION || process.env.BACKBLAZE_REGION || 'us-east-005';
const B2_PUBLIC_URL = process.env.B2_PUBLIC_URL || process.env.BACKBLAZE_PUBLIC_URL;
const B2_ENABLED = !!(B2_KEY_ID && B2_APPLICATION_KEY && B2_BUCKET_NAME && B2_ENDPOINT);

// Directory paths
const ROOT_DIR = path.join(__dirname, '..', '..');
const LOCAL_DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const LOCAL_THUMBNAILS_DIR = path.join(ROOT_DIR, 'thumbnails');
const STORAGE_MODE = B2_ENABLED ? 'backblaze' : 'local';

module.exports = {
  ALLOWED_ORIGINS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_DRIVER,
  ADMIN_API_KEY,
  GITHUB_TOKEN,
  JWT_SECRET,
  ADMIN_USERNAME,
  ADMIN_PASSWORD_HASH,
  B2_KEY_ID,
  B2_APPLICATION_KEY,
  B2_BUCKET_NAME,
  B2_ENDPOINT,
  B2_REGION,
  B2_PUBLIC_URL,
  B2_ENABLED,
  ROOT_DIR,
  LOCAL_DOWNLOADS_DIR,
  LOCAL_THUMBNAILS_DIR,
  STORAGE_MODE
};
