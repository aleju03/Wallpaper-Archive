require('dotenv').config();

const {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client
} = require('@aws-sdk/client-s3');

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
  accessKeyId: process.env.B2_KEY_ID || process.env.BACKBLAZE_KEY_ID,
  secretAccessKey: process.env.B2_APPLICATION_KEY || process.env.BACKBLAZE_APPLICATION_KEY,
  bucket: process.env.B2_BUCKET_NAME || process.env.BACKBLAZE_BUCKET_NAME || 'wallpaper-archive',
  endpoint: normalizeEndpoint(process.env.B2_ENDPOINT || process.env.BACKBLAZE_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com'),
  region: process.env.B2_REGION || process.env.BACKBLAZE_REGION || 'us-east-005'
};

if (!source.endpoint) {
  throw new Error('Missing R2_ENDPOINT or R2_ACCOUNT_ID');
}

if (!destination.accessKeyId || !destination.secretAccessKey) {
  throw new Error('Missing Backblaze B2 credentials');
}

const DRY_RUN = process.env.CONFIRM_DELETE_R2_COPIED !== 'true';
const PREFIX = process.env.DELETE_R2_COPIED_PREFIX || '';
const EXCLUDED_PREFIXES = (process.env.DELETE_R2_EXCLUDED_PREFIXES || 'random-bs/')
  .split(',')
  .map(prefix => prefix.trim())
  .filter(Boolean);

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

const listKeys = async (client, bucket) => {
  const keys = new Set();
  let continuationToken = null;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: PREFIX || undefined,
      ContinuationToken: continuationToken
    }));

    for (const object of response.Contents || []) {
      if (object.Key) keys.add(object.Key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
  } while (continuationToken);

  return keys;
};

const isExcludedKey = (key = '') => EXCLUDED_PREFIXES.some(prefix => key.startsWith(prefix));

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const main = async () => {
  console.log(`Comparing R2 ${source.bucket} -> Backblaze ${destination.bucket}`);
  console.log(`Mode: ${DRY_RUN ? 'dry run' : 'delete from R2'}`);
  if (PREFIX) console.log(`Prefix: ${PREFIX}`);

  const [r2Keys, b2Keys] = await Promise.all([
    listKeys(r2, source.bucket),
    listKeys(b2, destination.bucket)
  ]);

  const excludedR2Keys = Array.from(r2Keys).filter(isExcludedKey).sort();
  const eligibleR2Keys = Array.from(r2Keys).filter(key => !isExcludedKey(key));
  const copiedKeys = eligibleR2Keys.filter(key => b2Keys.has(key)).sort();
  const missingInBackblaze = eligibleR2Keys.filter(key => !b2Keys.has(key)).sort();

  console.log(`R2 objects scanned: ${r2Keys.size}`);
  console.log(`Backblaze objects scanned: ${b2Keys.size}`);
  console.log(`R2 objects excluded from cleanup: ${excludedR2Keys.length}`);
  console.log(`R2 objects safe to delete: ${copiedKeys.length}`);
  console.log(`R2 objects not found in Backblaze: ${missingInBackblaze.length}`);

  if (missingInBackblaze.length > 0) {
    console.log('First R2 objects not yet in Backblaze:');
    for (const key of missingInBackblaze.slice(0, 25)) {
      console.log(`- ${key}`);
    }
  }

  if (DRY_RUN) {
    console.log('Dry run only. Set CONFIRM_DELETE_R2_COPIED=true to delete the copied R2 objects.');
    return;
  }

  for (const keys of chunk(copiedKeys, 1000)) {
    await r2.send(new DeleteObjectsCommand({
      Bucket: source.bucket,
      Delete: {
        Objects: keys.map(Key => ({ Key })),
        Quiet: true
      }
    }));
    console.log(`Deleted ${keys.length} R2 objects`);
  }

  console.log('R2 cleanup complete');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
