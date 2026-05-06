require('dotenv').config();

const {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand
} = require('@aws-sdk/client-s3');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const normalizeEndpoint = (value) => value ? value.replace(/\/$/, '') : value;

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const r2AccountId = process.env.R2_ACCOUNT_ID;
const source = {
  accessKeyId: required('R2_ACCESS_KEY_ID'),
  secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  bucket: required('R2_BUCKET_NAME'),
  endpoint: normalizeEndpoint(process.env.R2_ENDPOINT || (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : null)),
  region: 'auto'
};

const destination = {
  accessKeyId: process.env.B2_KEY_ID || process.env.BACKBLAZE_KEY_ID || '31b25de0c8f7',
  secretAccessKey: process.env.B2_APPLICATION_KEY || process.env.BACKBLAZE_APPLICATION_KEY,
  bucket: process.env.B2_BUCKET_NAME || process.env.BACKBLAZE_BUCKET_NAME || 'wallpaper-archive',
  endpoint: normalizeEndpoint(process.env.B2_ENDPOINT || process.env.BACKBLAZE_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com'),
  region: process.env.B2_REGION || process.env.BACKBLAZE_REGION || 'us-east-005'
};

const CHECKPOINT_PATH = process.env.MIGRATION_CHECKPOINT_PATH || path.join(process.cwd(), '.migration-r2-to-b2.json');
const CONCURRENCY = Math.max(1, Math.min(parseInt(process.env.MIGRATION_CONCURRENCY || '8', 10), 25));
const SYNC_DESTINATION_CHECKPOINT = process.env.MIGRATION_SYNC_DESTINATION_CHECKPOINT !== 'false';
const EXCLUDED_PREFIXES = (process.env.MIGRATION_EXCLUDED_PREFIXES || 'random-bs/')
  .split(',')
  .map(prefix => prefix.trim())
  .filter(Boolean);

if (!source.endpoint) {
  throw new Error('Missing R2_ENDPOINT or R2_ACCOUNT_ID');
}

if (!destination.secretAccessKey) {
  throw new Error('Missing B2_APPLICATION_KEY or BACKBLAZE_APPLICATION_KEY');
}

const r2 = new S3Client({
  region: source.region,
  endpoint: source.endpoint,
  credentials: {
    accessKeyId: source.accessKeyId,
    secretAccessKey: source.secretAccessKey
  }
});

const b2 = new S3Client({
  region: destination.region,
  endpoint: destination.endpoint,
  credentials: {
    accessKeyId: destination.accessKeyId,
    secretAccessKey: destination.secretAccessKey
  }
});

const loadCheckpoint = () => {
  try {
    if (!fs.existsSync(CHECKPOINT_PATH)) {
      return { copied: [] };
    }
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return { copied: [] };
  }
};

const saveCheckpoint = (copiedKeys) => {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({
    copied: Array.from(copiedKeys).sort(),
    updatedAt: new Date().toISOString()
  }, null, 2));
};

const isExcludedKey = (key = '') => EXCLUDED_PREFIXES.some(prefix => key.startsWith(prefix));

const syncCheckpointFromDestination = async (copiedKeys) => {
  if (!SYNC_DESTINATION_CHECKPOINT) return 0;

  let continuationToken = null;
  let added = 0;

  do {
    const response = await b2.send(new ListObjectsV2Command({
      Bucket: destination.bucket,
      ContinuationToken: continuationToken
    }));

    for (const object of response.Contents || []) {
      if (object.Key && !isExcludedKey(object.Key) && !copiedKeys.has(object.Key)) {
        copiedKeys.add(object.Key);
        added += 1;
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
  } while (continuationToken);

  if (added > 0) {
    saveCheckpoint(copiedKeys);
  }

  return added;
};

const copyObject = async (object, copiedKeys) => {
  const key = object.Key;
  if (!key) return { status: 'skipped' };
  if (isExcludedKey(key)) return { status: 'excluded', key, bytes: 0 };
  if (copiedKeys.has(key)) {
    return { status: 'checkpoint', key, bytes: 0 };
  }

  const sourceObject = await r2.send(new GetObjectCommand({
    Bucket: source.bucket,
    Key: key
  }));

  await b2.send(new PutObjectCommand({
    Bucket: destination.bucket,
    Key: key,
    Body: sourceObject.Body,
    ContentLength: sourceObject.ContentLength,
    ContentType: sourceObject.ContentType || 'application/octet-stream'
  }));

  copiedKeys.add(key);
  saveCheckpoint(copiedKeys);

  return { status: 'copied', key, bytes: object.Size || sourceObject.ContentLength || 0 };
};

const runPool = async (items, worker) => {
  const results = [];
  let index = 0;

  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
  return results;
};

const migrateObjects = async () => {
  const checkpoint = loadCheckpoint();
  const copiedKeys = new Set(checkpoint.copied || []);
  const syncedFromDestination = await syncCheckpointFromDestination(copiedKeys);
  let continuationToken = null;
  let copied = 0;
  let skippedByCheckpoint = 0;
  let excluded = 0;
  let failed = 0;
  let bytes = 0;
  const failures = [];

  do {
    const response = await r2.send(new ListObjectsV2Command({
      Bucket: source.bucket,
      ContinuationToken: continuationToken
    }));

    const objects = response.Contents || [];
    const results = await runPool(objects, async (object) => {
      try {
        const result = await copyObject(object, copiedKeys);
        return result;
      } catch (error) {
        return {
          status: 'failed',
          key: object.Key,
          statusCode: error?.$metadata?.httpStatusCode,
          name: error?.name,
          message: error?.message
        };
      }
    });

    for (const result of results) {
      if (result.status === 'copied') copied += 1;
      if (result.status === 'checkpoint') skippedByCheckpoint += 1;
      if (result.status === 'excluded') excluded += 1;
      if (result.status === 'failed') {
        failed += 1;
        failures.push(result);
      }
      bytes += result.bytes || 0;
      console.log(`${result.status}: ${result.key}`);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
  } while (continuationToken);

  return { copied, skippedByCheckpoint, syncedFromDestination, excluded, failed, failures, bytes };
};

const keyFromUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    const key = url.pathname.replace(/^\//, '');
    return key.startsWith(`${source.bucket}/`) ? key.slice(source.bucket.length + 1) : key;
  } catch {
    return null;
  }
};

const rewriteDatabaseUrls = async () => {
  if (process.env.SKIP_DB_URL_REWRITE === 'true') {
    return { skipped: true, updated: 0 };
  }

  const url = process.env.TURSO_DATABASE_URL || 'file:wallpapers.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const db = createClient({ url, authToken });
  const rows = await db.execute('SELECT id, download_url FROM wallpapers');
  let updated = 0;

  for (const row of rows.rows || []) {
    const key = keyFromUrl(row.download_url);
    if (!key || !key.startsWith('images/')) continue;

    const nextUrl = `${destination.endpoint}/${destination.bucket}/${key}`;
    if (nextUrl === row.download_url) continue;

    await db.execute({
      sql: 'UPDATE wallpapers SET download_url = ? WHERE id = ?',
      args: [nextUrl, row.id]
    });
    updated += 1;
  }

  return { skipped: false, updated };
};

const main = async () => {
  console.log(`Copying ${source.bucket} (${source.endpoint}) -> ${destination.bucket} (${destination.endpoint})`);
  const objectResult = await migrateObjects();
  const dbResult = await rewriteDatabaseUrls();

  console.log('Migration complete');
  console.log(`Objects added to checkpoint from Backblaze: ${objectResult.syncedFromDestination}`);
  console.log(`Objects copied: ${objectResult.copied}`);
  console.log(`Objects skipped by checkpoint: ${objectResult.skippedByCheckpoint}`);
  console.log(`Objects excluded: ${objectResult.excluded}`);
  console.log(`Objects failed: ${objectResult.failed}`);
  console.log(`Bytes processed: ${objectResult.bytes}`);
  console.log(dbResult.skipped ? 'Database URL rewrite skipped' : `Database URLs updated: ${dbResult.updated}`);

  if (objectResult.failures.length > 0) {
    console.log('Failed object keys:');
    for (const failure of objectResult.failures) {
      console.log(`- ${failure.key}: ${failure.statusCode || failure.name || 'unknown'} ${failure.message || ''}`);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
