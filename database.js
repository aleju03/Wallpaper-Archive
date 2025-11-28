const { createClient } = require('@libsql/client');
require('dotenv').config();

class Database {
  constructor() {
    const url = process.env.TURSO_DATABASE_URL || 'file:wallpapers.db';
    const authToken = process.env.TURSO_AUTH_TOKEN;

    this.client = createClient({
      url,
      authToken,
    });
    
    this.init();
  }

  async init() {
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
        elo_rating INTEGER DEFAULT 1000,
        battles_won INTEGER DEFAULT 0,
        battles_lost INTEGER DEFAULT 0,
        UNIQUE(provider, folder, filename)
      );

      CREATE INDEX IF NOT EXISTS idx_provider ON wallpapers(provider);
      CREATE INDEX IF NOT EXISTS idx_folder ON wallpapers(folder);
      CREATE INDEX IF NOT EXISTS idx_filename ON wallpapers(filename);
      CREATE INDEX IF NOT EXISTS idx_perceptual_hash ON wallpapers(perceptual_hash);
      CREATE INDEX IF NOT EXISTS idx_elo_rating ON wallpapers(elo_rating);
    `;

    try {
      await this.client.executeMultiple(basicSchema);
      console.log('Database initialized successfully');
    } catch (err) {
      console.error('Error creating database schema:', err);
    }
  }

  // Migration method removed as we are creating the full schema in init() for this "serverless" version.
  // If you need to migrate existing data, you would likely use a separate script.

  async insertWallpaper(wallpaper) {
    // Hash generation removed from DB layer for serverless purity. 
    // It should be done by the admin tool before insertion.

    const sql = `
      INSERT INTO wallpapers 
      (filename, provider, folder, file_size, dimensions, download_url, local_path, tags, perceptual_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, folder, filename) DO UPDATE SET
      file_size=excluded.file_size,
      dimensions=excluded.dimensions,
      download_url=excluded.download_url,
      local_path=excluded.local_path,
      tags=excluded.tags,
      perceptual_hash=excluded.perceptual_hash
    `;
    
    try {
      const result = await this.client.execute({
        sql,
        args: [
          wallpaper.filename,
          wallpaper.provider,
          wallpaper.folder,
          wallpaper.file_size,
          wallpaper.dimensions,
          wallpaper.download_url,
          wallpaper.local_path,
          wallpaper.tags,
          wallpaper.perceptual_hash
        ]
      });
      return result.lastInsertRowid;
    } catch (err) {
      throw err;
    }
  }

  async getWallpapers(filters = {}) {
    let sql = 'SELECT * FROM wallpapers WHERE 1=1';
    const args = [];

    if (filters.provider) {
      sql += ' AND provider = ?';
      args.push(filters.provider);
    }

    if (filters.folder) {
      sql += ' AND folder = ?';
      args.push(filters.folder);
    }

    if (filters.filename) {
      sql += ' AND filename = ?';
      args.push(filters.filename);
    }

    if (filters.search) {
      sql += ' AND (filename LIKE ? OR tags LIKE ?)';
      args.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.resolution) {
      sql += ' AND dimensions = ?';
      args.push(filters.resolution);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      args.push(filters.limit);
      
      if (filters.offset) {
        sql += ' OFFSET ?';
        args.push(filters.offset);
      }
    }

    const result = await this.client.execute({ sql, args });
    return result.rows;
  }

  async getWallpapersCount(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM wallpapers WHERE 1=1';
    const args = [];

    if (filters.provider) {
      sql += ' AND provider = ?';
      args.push(filters.provider);
    }

    if (filters.folder) {
      sql += ' AND folder = ?';
      args.push(filters.folder);
    }

    if (filters.search) {
      sql += ' AND (filename LIKE ? OR tags LIKE ?)';
      args.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.resolution) {
      sql += ' AND dimensions = ?';
      args.push(filters.resolution);
    }

    const result = await this.client.execute({ sql, args });
    // LibSQL returns rows as objects if not configured otherwise, but we can access by property
    return result.rows[0].count; 
  }

  async getWallpaperById(id) {
    const result = await this.client.execute({
      sql: 'SELECT * FROM wallpapers WHERE id = ?',
      args: [id]
    });
    return result.rows[0];
  }

  async getStats() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT provider) as providers,
        COUNT(DISTINCT folder) as folders
      FROM wallpapers
    `;
    
    const result = await this.client.execute(sql);
    return result.rows[0];
  }

  async getUniqueResolutions() {
    const sql = `
      SELECT dimensions, COUNT(*) as count 
      FROM wallpapers 
      WHERE dimensions IS NOT NULL 
      GROUP BY dimensions 
      ORDER BY count DESC, dimensions ASC
    `;
    
    const result = await this.client.execute(sql);
    return result.rows;
  }

  async updatePerceptualHash(id, hash) {
    const result = await this.client.execute({
      sql: 'UPDATE wallpapers SET perceptual_hash = ? WHERE id = ?',
      args: [hash, id]
    });
    return result.rowsAffected;
  }

  async getAllWallpapersWithoutHashes() {
    const result = await this.client.execute('SELECT * FROM wallpapers WHERE perceptual_hash IS NULL OR perceptual_hash = ""');
    return result.rows;
  }

  async getAllWallpapersWithHashes() {
    const result = await this.client.execute('SELECT * FROM wallpapers WHERE perceptual_hash IS NOT NULL AND perceptual_hash != ""');
    return result.rows;
  }

  async deleteWallpaper(id) {
    const result = await this.client.execute({
      sql: 'DELETE FROM wallpapers WHERE id = ?',
      args: [id]
    });
    return result.rowsAffected;
  }

  // Arena-specific methods
  async getRandomWallpaperPair(excludeIds = []) {
    // Build exclusion clause if we have IDs to exclude
    const hasExclusions = excludeIds.length > 0;
    const excludePlaceholders = hasExclusions ? excludeIds.map(() => '?').join(',') : '';
    const excludeClause = hasExclusions ? `AND id NOT IN (${excludePlaceholders})` : '';
    
    // Step 1: Pick first wallpaper truly randomly (no bias - for variety)
    const firstSql = `
      SELECT * FROM wallpapers 
      WHERE download_url IS NOT NULL AND download_url != ''
        ${excludeClause}
      ORDER BY RANDOM()
      LIMIT 1
    `;
    
    const firstResult = await this.client.execute({
      sql: firstSql,
      args: hasExclusions ? [...excludeIds] : []
    });
    
    // If no wallpapers found with exclusions, try without them
    if (firstResult.rows.length === 0 && hasExclusions) {
      const fallbackFirstSql = `
        SELECT * FROM wallpapers 
        WHERE download_url IS NOT NULL AND download_url != ''
        ORDER BY RANDOM()
        LIMIT 1
      `;
      const fallbackFirst = await this.client.execute(fallbackFirstSql);
      if (fallbackFirst.rows.length === 0) return [];
      firstResult.rows = fallbackFirst.rows;
    }
    
    if (firstResult.rows.length === 0) return [];
    
    const firstWallpaper = firstResult.rows[0];
    const firstElo = firstWallpaper.elo_rating || 1000;
    
    // Step 2: Try to find second wallpaper within ±400 Elo (excluding seen ones)
    const secondExcludeIds = hasExclusions ? [...excludeIds, firstWallpaper.id] : [firstWallpaper.id];
    const secondExcludePlaceholders = secondExcludeIds.map(() => '?').join(',');
    
    const matchedSql = `
      SELECT * FROM wallpapers 
      WHERE download_url IS NOT NULL AND download_url != ''
        AND id NOT IN (${secondExcludePlaceholders})
        AND COALESCE(elo_rating, 1000) BETWEEN ? AND ?
      ORDER BY RANDOM()
      LIMIT 1
    `;
    
    const matchedResult = await this.client.execute({
      sql: matchedSql,
      args: [...secondExcludeIds, firstElo - 400, firstElo + 400]
    });
    
    // Step 3: Fallback to any random wallpaper if no Elo-matched one found
    let secondWallpaper;
    if (matchedResult.rows.length > 0) {
      secondWallpaper = matchedResult.rows[0];
    } else {
      const fallbackSql = `
        SELECT * FROM wallpapers 
        WHERE download_url IS NOT NULL AND download_url != ''
          AND id NOT IN (${secondExcludePlaceholders})
        ORDER BY RANDOM()
        LIMIT 1
      `;
      const fallbackResult = await this.client.execute({
        sql: fallbackSql,
        args: secondExcludeIds
      });
      
      // If still nothing, try without any exclusions except first wallpaper
      if (fallbackResult.rows.length === 0) {
        const lastResortSql = `
          SELECT * FROM wallpapers 
          WHERE download_url IS NOT NULL AND download_url != ''
            AND id != ?
          ORDER BY RANDOM()
          LIMIT 1
        `;
        const lastResort = await this.client.execute({
          sql: lastResortSql,
          args: [firstWallpaper.id]
        });
        if (lastResort.rows.length === 0) return [firstWallpaper];
        secondWallpaper = lastResort.rows[0];
      } else {
        secondWallpaper = fallbackResult.rows[0];
      }
    }
    
    return [firstWallpaper, secondWallpaper];
  }

  async getRandomWallpaper() {
    const sql = `
      SELECT * FROM wallpapers 
      WHERE download_url IS NOT NULL AND download_url != ''
      ORDER BY RANDOM() 
      LIMIT 1
    `;
    
    const result = await this.client.execute(sql);
    return result.rows[0];
  }

  async updateArenaResults(winnerId, loserId, voteTimeMs = null) {
    // Transaction-like logic handled manually or via batch if possible.
    // We'll do separate lookups and updates for simplicity with HTTP driver.
    
    const getEloSql = `
      SELECT id, 
        COALESCE(elo_rating, 1000) as elo_rating,
        COALESCE(battles_won, 0) as battles_won,
        COALESCE(battles_lost, 0) as battles_lost
      FROM wallpapers WHERE id IN (?, ?)
    `;
    const result = await this.client.execute({
      sql: getEloSql,
      args: [winnerId, loserId]
    });
    const rows = result.rows;

    // Since rows are returned as generic objects in LibSQL (e.g., {id: 1, elo_rating: 1000})
    // Note: depending on the driver version/config, it might be an array of arrays or objects. 
    // The standard @libsql/client returns objects { col: val }.
    
    const winner = rows.find(r => r.id == winnerId); // Loose equality for string/int safety
    const loser = rows.find(r => r.id == loserId);

    if (!winner || !loser) {
      throw new Error('Wallpapers not found');
    }

    // Get total battles for each wallpaper to determine if provisional
    const winnerBattles = (winner.battles_won || 0) + (winner.battles_lost || 0);
    const loserBattles = (loser.battles_won || 0) + (loser.battles_lost || 0);
    
    // Provisional K-factor: K=64 for first 10 battles, then K=32
    // Use average of both wallpapers' provisional status
    const winnerK = winnerBattles < 10 ? 64 : 32;
    const loserK = loserBattles < 10 ? 64 : 32;
    let K = (winnerK + loserK) / 2;
    
    // Time-based weighting (fixed: penalize spam, reward thoughtful votes)
    if (voteTimeMs !== null) {
      if (voteTimeMs < 800) {
        // Spam protection: very fast votes are likely not thoughtful
        K = Math.round(K * 0.5);
      } else if (voteTimeMs > 10000) {
        // Slightly reduce for very slow votes (distracted user)
        K = Math.round(K * 0.9);
      }
      // 800ms - 10s: standard multiplier (1.0x), no change needed
    }
    
    const expectedWinner = 1 / (1 + Math.pow(10, (loser.elo_rating - winner.elo_rating) / 400));
    const expectedLoser = 1 - expectedWinner;

    const newWinnerElo = Math.round(winner.elo_rating + K * (1 - expectedWinner));
    const newLoserElo = Math.round(loser.elo_rating + K * (0 - expectedLoser));

    // Perform updates sequentially
    const updateSql = `
      UPDATE wallpapers 
      SET elo_rating = ?, battles_won = COALESCE(battles_won, 0) + ?, battles_lost = COALESCE(battles_lost, 0) + ?
      WHERE id = ?
    `;

    // We can use batch for atomicity if supported, or just await both.
    // await this.client.batch([ ... ])
    
    await this.client.execute({
      sql: updateSql,
      args: [newWinnerElo, 1, 0, winnerId]
    });

    await this.client.execute({
      sql: updateSql,
      args: [newLoserElo, 0, 1, loserId]
    });

    return {
      winner: { id: winnerId, oldElo: winner.elo_rating, newElo: newWinnerElo },
      loser: { id: loserId, oldElo: loser.elo_rating, newElo: newLoserElo }
    };
  }

  async getLeaderboard(limit = 50, getBottom = false) {
    const orderBy = getBottom 
      ? 'ORDER BY COALESCE(elo_rating, 1000) ASC, total_battles ASC'
      : 'ORDER BY COALESCE(elo_rating, 1000) DESC, total_battles DESC';
      
    const sql = `
      SELECT 
        id, filename, provider, dimensions, local_path, download_url,
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
      WHERE download_url IS NOT NULL AND download_url != ""
      ${orderBy}
      LIMIT ?
    `;
    
    const result = await this.client.execute({
      sql,
      args: [limit]
    });
    return result.rows;
  }

  async getTotalWallpaperCount() {
    const sql = 'SELECT COUNT(*) as count FROM wallpapers WHERE download_url IS NOT NULL AND download_url != ""';
    const result = await this.client.execute(sql);
    return result.rows[0].count;
  }

  async resetArenaStats() {
    const resetSql = `
      UPDATE wallpapers 
      SET elo_rating = 1000, battles_won = 0, battles_lost = 0
      WHERE 1=1
    `;
    const result = await this.client.execute(resetSql);
    return result.rowsAffected;
  }

  close() {
    // LibSQL client doesn't explicitly require closing for HTTP, but good practice
    // this.client.close(); 
  }
}

module.exports = Database;
