const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor(dbPath = './wallpapers.db') {
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
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
        UNIQUE(provider, folder, filename)
      );

      CREATE INDEX IF NOT EXISTS idx_provider ON wallpapers(provider);
      CREATE INDEX IF NOT EXISTS idx_folder ON wallpapers(folder);
      CREATE INDEX IF NOT EXISTS idx_filename ON wallpapers(filename);
      CREATE INDEX IF NOT EXISTS idx_perceptual_hash ON wallpapers(perceptual_hash);
    `;

    this.db.exec(schema, (err) => {
      if (err) {
        console.error('Error creating database schema:', err);
      } else {
        console.log('Database initialized successfully');
      }
    });
  }

  async insertWallpaper(wallpaper) {
    // Auto-generate hash if image file exists and no hash provided
    if (!wallpaper.perceptual_hash && wallpaper.local_path) {
      try {
        const fs = require('fs').promises;
        await fs.access(wallpaper.local_path);
        const { generatePerceptualHash } = require('./image-hash');
        wallpaper.perceptual_hash = await generatePerceptualHash(wallpaper.local_path);
        console.log(`Generated hash for new image: ${wallpaper.filename}`);
      } catch (error) {
        console.log(`Could not generate hash for ${wallpaper.filename}:`, error.message);
        wallpaper.perceptual_hash = null;
      }
    }

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO wallpapers 
        (filename, provider, folder, file_size, dimensions, download_url, local_path, tags, perceptual_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        wallpaper.filename,
        wallpaper.provider,
        wallpaper.folder,
        wallpaper.file_size,
        wallpaper.dimensions,
        wallpaper.download_url,
        wallpaper.local_path,
        wallpaper.tags,
        wallpaper.perceptual_hash
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getWallpapers(filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM wallpapers WHERE 1=1';
      const params = [];

      if (filters.provider) {
        sql += ' AND provider = ?';
        params.push(filters.provider);
      }

      if (filters.folder) {
        sql += ' AND folder = ?';
        params.push(filters.folder);
      }

      if (filters.filename) {
        sql += ' AND filename = ?';
        params.push(filters.filename);
      }

      if (filters.search) {
        sql += ' AND (filename LIKE ? OR tags LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }

      sql += ' ORDER BY created_at DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
        
        if (filters.offset) {
          sql += ' OFFSET ?';
          params.push(filters.offset);
        }
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getWallpapersCount(filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT COUNT(*) as count FROM wallpapers WHERE 1=1';
      const params = [];

      if (filters.provider) {
        sql += ' AND provider = ?';
        params.push(filters.provider);
      }

      if (filters.folder) {
        sql += ' AND folder = ?';
        params.push(filters.folder);
      }

      if (filters.search) {
        sql += ' AND (filename LIKE ? OR tags LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }

      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  async getWallpaperById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM wallpapers WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT provider) as providers,
          COUNT(DISTINCT folder) as folders
        FROM wallpapers
      `;
      
      this.db.get(sql, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async updatePerceptualHash(id, hash) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE wallpapers SET perceptual_hash = ? WHERE id = ?', [hash, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async getAllWallpapersWithoutHashes() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM wallpapers WHERE perceptual_hash IS NULL OR perceptual_hash = ""', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getAllWallpapersWithHashes() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM wallpapers WHERE perceptual_hash IS NOT NULL AND perceptual_hash != ""', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async deleteWallpaper(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM wallpapers WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;