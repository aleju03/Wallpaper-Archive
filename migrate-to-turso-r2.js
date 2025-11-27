const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

// Configuration
const R2_PUBLIC_DOMAIN = 'https://pub-256a1a925fbe4e24a6202c575a6aedf0.r2.dev';
const LOCAL_DB_PATH = './wallpapers.db';

// Initialize Turso Client
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize Local SQLite
const localDb = new sqlite3.Database(LOCAL_DB_PATH);

async function createTursoSchema() {
  console.log('📦 Creating Turso schema if not exists...');
  
  const schema = `
    CREATE TABLE IF NOT EXISTS wallpapers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      provider TEXT NOT NULL,
      folder TEXT,
      file_size INTEGER,
      dimensions TEXT,
      download_url TEXT NOT NULL,
      local_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tags TEXT,
      perceptual_hash TEXT,
      elo_rating INTEGER DEFAULT 1000,
      battles_won INTEGER DEFAULT 0,
      battles_lost INTEGER DEFAULT 0,
      UNIQUE(provider, folder, filename)
    );
  `;
  
  await turso.execute(schema);
  
  // Create indexes separately (Turso/libSQL may not support multiple statements in one execute)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_provider ON wallpapers(provider)',
    'CREATE INDEX IF NOT EXISTS idx_folder ON wallpapers(folder)',
    'CREATE INDEX IF NOT EXISTS idx_filename ON wallpapers(filename)',
    'CREATE INDEX IF NOT EXISTS idx_perceptual_hash ON wallpapers(perceptual_hash)',
    'CREATE INDEX IF NOT EXISTS idx_elo_rating ON wallpapers(elo_rating)'
  ];
  
  for (const idx of indexes) {
    await turso.execute(idx);
  }
  
  console.log('✅ Schema ready!');
}

async function migrate() {
  console.log('🚀 Starting migration: Local SQLite -> Turso + R2 URLs');
  
  // 0. Ensure schema exists in Turso
  await createTursoSchema();
  
  // 1. Get all local wallpapers
  const localWallpapers = await new Promise((resolve, reject) => {
    localDb.all('SELECT * FROM wallpapers', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log(`found ${localWallpapers.length} wallpapers locally.`);

  // 2. Prepare batch insert/upsert for Turso
  let processed = 0;
  let errors = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < localWallpapers.length; i += BATCH_SIZE) {
    const batch = localWallpapers.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (w) => {
      const filename = path.basename(w.local_path || w.filename);
      
      // Construct R2 URLs
      // NOTE: Ensure your R2 upload script put files in 'images/' folder
      const r2DownloadUrl = `${R2_PUBLIC_DOMAIN}/images/${filename}`;
      // We map thumbnail_url to same place or specific thumb folder if you uploaded thumbs
      // Assuming 'thumbnails/' folder exists in R2 based on upload-to-r2.js
      // const r2ThumbnailUrl = `${R2_PUBLIC_DOMAIN}/thumbnails/${filename}`; 
      
      // Check if filename ends in jpg/png for thumb, simple replace for now if ext matches
      // Actually, just use the raw image URL for now as requested in server.js refactor, 
      // OR if you uploaded thumbnails to 'thumbnails/', we can try to match extension.
      // Let's stick to the server.js logic: "download_url" is the main source of truth.
      
      const sql = `
        INSERT INTO wallpapers 
        (filename, provider, folder, file_size, dimensions, download_url, local_path, tags, perceptual_hash, elo_rating, battles_won, battles_lost, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, folder, filename) DO UPDATE SET
        download_url=excluded.download_url,
        local_path=excluded.local_path,
        file_size=excluded.file_size,
        dimensions=excluded.dimensions,
        elo_rating=excluded.elo_rating,
        battles_won=excluded.battles_won,
        battles_lost=excluded.battles_lost
      `;

      const args = [
        w.filename,
        w.provider,
        w.folder,
        w.file_size,
        w.dimensions,
        r2DownloadUrl, // Overwriting old download_url with new R2 URL
        '', // local_path is irrelevant in cloud, clearing it or keeping filename
        w.tags,
        w.perceptual_hash,
        w.elo_rating || 1000,
        w.battles_won || 0,
        w.battles_lost || 0,
        w.created_at
      ];

      try {
        await turso.execute({ sql, args });
        processed++;
      } catch (err) {
        console.error(`❌ Error inserting ${w.filename}:`, err.message);
        errors++;
      }
    });

    await Promise.all(promises);
    
    if ((i + BATCH_SIZE) % 500 === 0) {
      console.log(`Processed ${processed}/${localWallpapers.length} items...`);
    }
  }

  console.log(`
✨ Migration Complete!
✅ Processed: ${processed}
❌ Errors: ${errors}
  `);
  
  localDb.close();
  // turso client doesn't strictly need close() in HTTP mode
}

migrate().catch(console.error);
