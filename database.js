const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor(dbPath = './wallpapers.db') {
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    // First create the basic table structure
    const basicSchema = `
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

    this.db.exec(basicSchema, (err) => {
      if (err) {
        console.error('Error creating database schema:', err);
      } else {
        console.log('Database initialized successfully');
        // Run migrations for existing databases
        this.runMigrations();
      }
    });
  }

  runMigrations() {
    // Add ELO columns if they don't exist (one by one to handle errors gracefully)
    this.db.run('ALTER TABLE wallpapers ADD COLUMN elo_rating INTEGER DEFAULT 1000', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding elo_rating column:', err.message);
      }
    });

    this.db.run('ALTER TABLE wallpapers ADD COLUMN battles_won INTEGER DEFAULT 0', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding battles_won column:', err.message);
      }
    });

    this.db.run('ALTER TABLE wallpapers ADD COLUMN battles_lost INTEGER DEFAULT 0', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding battles_lost column:', err.message);
      } else {
        // After all columns are added, create the index
        this.db.run('CREATE INDEX IF NOT EXISTS idx_elo_rating ON wallpapers(elo_rating)', (indexErr) => {
          if (indexErr) {
            console.error('Error creating ELO index:', indexErr.message);
          } else {
            console.log('ELO migration completed successfully');
          }
        });
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

      if (filters.resolution) {
        sql += ' AND dimensions = ?';
        params.push(filters.resolution);
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

      if (filters.resolution) {
        sql += ' AND dimensions = ?';
        params.push(filters.resolution);
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

  async getUniqueResolutions() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT dimensions, COUNT(*) as count 
        FROM wallpapers 
        WHERE dimensions IS NOT NULL 
        GROUP BY dimensions 
        ORDER BY count DESC, dimensions ASC
      `;
      
      this.db.all(sql, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
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

  // Arena-specific methods
  async getRandomWallpaperPair() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM wallpapers 
        WHERE local_path IS NOT NULL AND local_path != ''
        ORDER BY RANDOM() 
        LIMIT 2
      `;
      
      this.db.all(sql, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async updateArenaResults(winnerId, loserId, voteTimeMs = null) {
    return new Promise((resolve, reject) => {
      // Get current ELO ratings
      const getEloSql = 'SELECT id, COALESCE(elo_rating, 1000) as elo_rating FROM wallpapers WHERE id IN (?, ?)';
      
      this.db.all(getEloSql, [winnerId, loserId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const winner = rows.find(r => r.id === winnerId);
        const loser = rows.find(r => r.id === loserId);

        if (!winner || !loser) {
          reject(new Error('Wallpapers not found'));
          return;
        }

        // Calculate dynamic K-factor based on vote time
        let K = 32; // Base ELO constant
        
        if (voteTimeMs !== null) {
          // Time-based K-factor adjustment:
          // - Very fast votes (< 1s): K * 1.5 (clear preference)
          // - Fast votes (1-3s): K * 1.2  
          // - Normal votes (3-10s): K * 1.0
          // - Slow votes (> 10s): K * 0.8 (uncertain decision)
          if (voteTimeMs < 1000) {
            K = Math.round(K * 1.5); // Very decisive
          } else if (voteTimeMs < 3000) {
            K = Math.round(K * 1.2); // Decisive
          } else if (voteTimeMs > 10000) {
            K = Math.round(K * 0.8); // Uncertain
          }
          // 3-10s range keeps default K value
        }
        
        const expectedWinner = 1 / (1 + Math.pow(10, (loser.elo_rating - winner.elo_rating) / 400));
        const expectedLoser = 1 - expectedWinner;

        const newWinnerElo = Math.round(winner.elo_rating + K * (1 - expectedWinner));
        const newLoserElo = Math.round(loser.elo_rating + K * (0 - expectedLoser));

        // Update both wallpapers
        const updateSql = `
          UPDATE wallpapers 
          SET elo_rating = ?, battles_won = COALESCE(battles_won, 0) + ?, battles_lost = COALESCE(battles_lost, 0) + ?
          WHERE id = ?
        `;

        this.db.run(updateSql, [newWinnerElo, 1, 0, winnerId], (err1) => {
          if (err1) {
            reject(err1);
            return;
          }

          this.db.run(updateSql, [newLoserElo, 0, 1, loserId], (err2) => {
            if (err2) {
              reject(err2);
              return;
            }

            resolve({
              winner: { id: winnerId, oldElo: winner.elo_rating, newElo: newWinnerElo },
              loser: { id: loserId, oldElo: loser.elo_rating, newElo: newLoserElo }
            });
          });
        });
      });
    });
  }

  async getLeaderboard(limit = 50, getBottom = false) {
    return new Promise((resolve, reject) => {
      const orderBy = getBottom 
        ? 'ORDER BY COALESCE(elo_rating, 1000) ASC, total_battles ASC'
        : 'ORDER BY COALESCE(elo_rating, 1000) DESC, total_battles DESC';
        
      const sql = `
        SELECT 
          id, filename, provider, dimensions, local_path,
          COALESCE(elo_rating, 1000) as elo_rating, 
          COALESCE(battles_won, 0) as battles_won, 
          COALESCE(battles_lost, 0) as battles_lost, 
          (COALESCE(battles_won, 0) + COALESCE(battles_lost, 0)) as total_battles,
          CASE 
            WHEN (COALESCE(battles_won, 0) + COALESCE(battles_lost, 0)) > 0 
            THEN ROUND((COALESCE(battles_won, 0) * 100.0) / (COALESCE(battles_won, 0) + COALESCE(battles_lost, 0)), 1) 
            ELSE 0 
          END as win_rate
        FROM wallpapers
        WHERE local_path IS NOT NULL AND local_path != ""
        ${orderBy}
        LIMIT ?
      `;
      
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getTotalWallpaperCount() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM wallpapers WHERE local_path IS NOT NULL AND local_path != ""';
      
      this.db.get(sql, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  async resetArenaStats() {
    return new Promise((resolve, reject) => {
      const resetSql = `
        UPDATE wallpapers 
        SET elo_rating = 1000, battles_won = 0, battles_lost = 0
        WHERE 1=1
      `;
      
      this.db.run(resetSql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;