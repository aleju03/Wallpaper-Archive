const { createClient } = require('@libsql/client');
require('dotenv').config();

const KNOWN_ASPECTS = [
  { label: '21:9', value: 21 / 9 },
  { label: '18:9', value: 18 / 9 },
  { label: '16:10', value: 16 / 10 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
  { label: '9:16', value: 9 / 16 }
];
const ASPECT_TOLERANCE = 0.06;

const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);

const computeAspectRatio = (dimensions) => {
  if (!dimensions || !dimensions.includes('x')) return null;
  const [widthRaw, heightRaw] = dimensions.split('x');
  const width = parseInt(widthRaw, 10);
  const height = parseInt(heightRaw, 10);
  if (!width || !height) return null;

  const ratio = width / height;
  let closest = null;
  let closestDiff = Number.MAX_VALUE;

  for (const candidate of KNOWN_ASPECTS) {
    const diff = Math.abs(candidate.value - ratio);
    if (diff < closestDiff) {
      closest = candidate;
      closestDiff = diff;
    }
  }

  if (closest && closestDiff <= ASPECT_TOLERANCE) {
    return closest.label;
  }

  const divisor = gcd(width, height) || 1;
  const reducedW = Math.round(width / divisor);
  const reducedH = Math.round(height / divisor);
  return `${reducedW}:${reducedH}`;
};

const buildFtsQuery = (search = '') => {
  const terms = search
    .trim()
    .split(/\s+/)
    .map(term => term.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(Boolean);
  if (!terms.length) return null;
  return terms.map(term => `${term}*`).join(' ');
};

class Database {
  constructor() {
    const url = process.env.TURSO_DATABASE_URL || 'file:wallpapers.db';
    const authToken = process.env.TURSO_AUTH_TOKEN;

    this.client = createClient({
      url,
      authToken,
    });
    this.ftsReady = false;
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
        aspect_ratio TEXT,
        download_count INTEGER DEFAULT 0,
        UNIQUE(provider, folder, filename)
      );

      CREATE INDEX IF NOT EXISTS idx_provider ON wallpapers(provider);
      CREATE INDEX IF NOT EXISTS idx_folder ON wallpapers(folder);
      CREATE INDEX IF NOT EXISTS idx_filename ON wallpapers(filename);
      CREATE INDEX IF NOT EXISTS idx_perceptual_hash ON wallpapers(perceptual_hash);
      CREATE INDEX IF NOT EXISTS idx_elo_rating ON wallpapers(elo_rating);

      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
      );
    `;

    try {
      await this.client.executeMultiple(basicSchema);
      await this.ensureColumns();
      await this.setupFts();
      await this.backfillAspectRatios();
      console.log('Database initialized successfully');
    } catch (err) {
      console.error('Error creating database schema:', err);
    }
  }

  async insertWallpaper(wallpaper) {
    const aspectRatio = wallpaper.aspect_ratio || computeAspectRatio(wallpaper.dimensions);

    const sql = `
      INSERT INTO wallpapers 
      (filename, provider, folder, file_size, dimensions, download_url, local_path, tags, perceptual_hash, aspect_ratio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, folder, filename) DO UPDATE SET
      file_size=excluded.file_size,
      dimensions=excluded.dimensions,
      download_url=excluded.download_url,
      local_path=excluded.local_path,
      tags=excluded.tags,
      perceptual_hash=excluded.perceptual_hash,
      aspect_ratio=excluded.aspect_ratio
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
          wallpaper.perceptual_hash,
          aspectRatio
        ]
      });
      return result.lastInsertRowid;
    } catch (err) {
      throw err;
    }
  }

  async queryWallpapers(filters = {}, useFts = false, ftsQuery = null) {
    let sql = useFts
      ? 'SELECT w.* FROM wallpapers w JOIN wallpapers_fts ON wallpapers_fts.rowid = w.id WHERE 1=1'
      : 'SELECT * FROM wallpapers WHERE 1=1';
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
      if (useFts) {
        sql += ' AND wallpapers_fts MATCH ?';
        args.push(ftsQuery);
      } else {
        sql += ' AND (filename LIKE ? OR tags LIKE ?)';
        args.push(`%${filters.search}%`, `%${filters.search}%`);
      }
    }

    if (filters.resolution) {
      sql += ' AND dimensions = ?';
      args.push(filters.resolution);
    }

    if (filters.aspect) {
      sql += ' AND aspect_ratio = ?';
      args.push(filters.aspect);
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

  async queryWallpapersCount(filters = {}, useFts = false, ftsQuery = null) {
    let sql = useFts
      ? 'SELECT COUNT(*) as count FROM wallpapers w JOIN wallpapers_fts ON wallpapers_fts.rowid = w.id WHERE 1=1'
      : 'SELECT COUNT(*) as count FROM wallpapers WHERE 1=1';
    const args = [];

    if (filters.provider) {
      sql += ' AND provider = ?';
      args.push(filters.provider);
    }

    if (filters.folders && filters.folders.length > 0) {
      const placeholders = filters.folders.map(() => '?').join(', ');
      sql += ` AND folder IN (${placeholders})`;
      args.push(...filters.folders);
    } else if (filters.folder) {
      sql += ' AND folder = ?';
      args.push(filters.folder);
    }

    if (filters.search) {
      if (useFts) {
        sql += ' AND wallpapers_fts MATCH ?';
        args.push(ftsQuery);
      } else {
        sql += ' AND (filename LIKE ? OR tags LIKE ?)';
        args.push(`%${filters.search}%`, `%${filters.search}%`);
      }
    }

    if (filters.resolution) {
      sql += ' AND dimensions = ?';
      args.push(filters.resolution);
    }

    if (filters.aspect) {
      sql += ' AND aspect_ratio = ?';
      args.push(filters.aspect);
    }

    const result = await this.client.execute({ sql, args });
    return result.rows[0].count;
  }

  async getWallpapers(filters = {}) {
    const ftsQuery = buildFtsQuery(filters.search || '');
    const useFts = this.ftsReady && !!ftsQuery;

    try {
      return await this.queryWallpapers(filters, useFts, ftsQuery);
    } catch (error) {
      if (useFts) {
        console.warn('FTS query failed, retrying without FTS', error);
        this.ftsReady = false;
        return this.queryWallpapers(filters, false, null);
      }
      throw error;
    }
  }

  async getWallpapersCount(filters = {}) {
    const ftsQuery = buildFtsQuery(filters.search || '');
    const useFts = this.ftsReady && !!ftsQuery;

    try {
      return await this.queryWallpapersCount(filters, useFts, ftsQuery);
    } catch (error) {
      if (useFts) {
        console.warn('FTS count failed, retrying without FTS', error);
        this.ftsReady = false;
        return this.queryWallpapersCount(filters, false, null);
      }
      throw error;
    }
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
        COUNT(DISTINCT folder) as folders,
        COALESCE(SUM(file_size), 0) as total_size
      FROM wallpapers
    `;
    
    const result = await this.client.execute(sql);
    return result.rows[0];
  }

  async getProviderBreakdown() {
    const sql = `
      SELECT 
        provider, 
        COUNT(*) as count, 
        MAX(created_at) as last_created_at,
        COALESCE(SUM(file_size), 0) as total_size
      FROM wallpapers
      GROUP BY provider
      ORDER BY count DESC
    `;
    const result = await this.client.execute(sql);
    return result.rows;
  }

  async getFolderBreakdown(limit = 25) {
    const sql = `
      SELECT 
        folder, 
        COUNT(*) as count,
        COALESCE(SUM(file_size), 0) as total_size
      FROM wallpapers
      WHERE folder IS NOT NULL AND folder != ''
      GROUP BY folder
      ORDER BY count DESC
      LIMIT ?
    `;
    const result = await this.client.execute({
      sql,
      args: [limit]
    });
    return result.rows;
  }

  async getAspectBreakdown() {
    const sql = `
      SELECT aspect_ratio, COUNT(*) as count
      FROM wallpapers
      WHERE aspect_ratio IS NOT NULL AND aspect_ratio != ''
      GROUP BY aspect_ratio
      ORDER BY count DESC
    `;
    const result = await this.client.execute(sql);
    return result.rows;
  }

  async getFileSizeBuckets() {
    const sql = `
      SELECT
        SUM(CASE WHEN file_size < 1048576 THEN 1 ELSE 0 END) as under_1mb,
        SUM(CASE WHEN file_size >= 1048576 AND file_size < 5242880 THEN 1 ELSE 0 END) as between_1_5mb,
        SUM(CASE WHEN file_size >= 5242880 AND file_size < 10485760 THEN 1 ELSE 0 END) as between_5_10mb,
        SUM(CASE WHEN file_size >= 10485760 THEN 1 ELSE 0 END) as over_10mb
      FROM wallpapers
    `;
    const result = await this.client.execute(sql);
    return result.rows[0];
  }

  async getHashStatus() {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN perceptual_hash IS NOT NULL AND perceptual_hash != '' THEN 1 ELSE 0 END) as with_hashes
      FROM wallpapers
    `;
    const result = await this.client.execute(sql);
    const row = result.rows[0] || { total: 0, with_hashes: 0 };
    const withHashes = Number(row.with_hashes || 0);
    const total = Number(row.total || 0);
    const withoutHashes = Math.max(total - withHashes, 0);
    const percentage = total === 0 ? 0 : Math.round((withHashes / total) * 100);
    return { total, withHashes, withoutHashes, percentage };
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
    const result = await this.client.execute('SELECT id, filename, provider, folder, file_size, dimensions, download_url, local_path FROM wallpapers WHERE perceptual_hash IS NULL OR perceptual_hash = ""');
    return result.rows;
  }

  async getAllWallpapersWithHashes() {
    const result = await this.client.execute('SELECT id, filename, provider, folder, file_size, dimensions, download_url, local_path, perceptual_hash FROM wallpapers WHERE perceptual_hash IS NOT NULL AND perceptual_hash != ""');
    return result.rows;
  }

  async getAllFilenames() {
    const result = await this.client.execute('SELECT filename FROM wallpapers WHERE filename IS NOT NULL AND filename != ""');
    return result.rows.map(row => row.filename);
  }

  async getProvidersAndFolders() {
    const providersResult = await this.client.execute(`
      SELECT provider, COUNT(*) as count, MAX(created_at) as last_created_at
      FROM wallpapers
      GROUP BY provider
      ORDER BY provider ASC
    `);
    const foldersResult = await this.client.execute(`
      SELECT folder, COUNT(*) as count
      FROM wallpapers 
      WHERE folder IS NOT NULL AND folder != '' 
      GROUP BY folder
      ORDER BY count DESC
    `);
    return {
      providers: providersResult.rows,
      folders: foldersResult.rows
    };
  }

  async getDownloadTotals() {
    const result = await this.client.execute(`
      SELECT COALESCE(SUM(download_count), 0) as total_downloads FROM wallpapers
    `);
    const row = result.rows[0] || {};
    return Number(row.total_downloads || 0);
  }

  async deleteWallpaper(id) {
    const result = await this.client.execute({
      sql: 'DELETE FROM wallpapers WHERE id = ?',
      args: [id]
    });
    return result.rowsAffected;
  }

  async getRandomWallpaperPair(excludeIds = []) {
    const hasExclusions = excludeIds.length > 0;
    const excludePlaceholders = hasExclusions ? excludeIds.map(() => '?').join(',') : '';
    const excludeClause = hasExclusions ? `AND id NOT IN (${excludePlaceholders})` : '';
    
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

    const winner = rows.find(r => r.id == winnerId);
    const loser = rows.find(r => r.id == loserId);

    if (!winner || !loser) {
      throw new Error('Wallpapers not found');
    }

    const winnerBattles = (winner.battles_won || 0) + (winner.battles_lost || 0);
    const loserBattles = (loser.battles_won || 0) + (loser.battles_lost || 0);
    
    const winnerK = winnerBattles < 10 ? 64 : 32;
    const loserK = loserBattles < 10 ? 64 : 32;
    let K = (winnerK + loserK) / 2;
    
    if (voteTimeMs !== null) {
      if (voteTimeMs < 800) {
        K = Math.round(K * 0.5);
      } else if (voteTimeMs > 10000) {
        K = Math.round(K * 0.9);
      }
    }
    
    const expectedWinner = 1 / (1 + Math.pow(10, (loser.elo_rating - winner.elo_rating) / 400));
    const expectedLoser = 1 - expectedWinner;

    const newWinnerElo = Math.round(winner.elo_rating + K * (1 - expectedWinner));
    const newLoserElo = Math.round(loser.elo_rating + K * (0 - expectedLoser));

    const updateSql = `
      UPDATE wallpapers 
      SET elo_rating = ?, battles_won = COALESCE(battles_won, 0) + ?, battles_lost = COALESCE(battles_lost, 0) + ?
      WHERE id = ?
    `;

    await this.client.batch([
      { sql: updateSql, args: [newWinnerElo, 1, 0, winnerId] },
      { sql: updateSql, args: [newLoserElo, 0, 1, loserId] }
    ], 'write');

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
    // LibSQL client doesn't explicitly require closing for HTTP
  }

  async ensureColumns() {
    const columns = await this.getTableColumns('wallpapers');
    const names = new Set(columns);

    if (!names.has('download_count')) {
      await this.client.execute('ALTER TABLE wallpapers ADD COLUMN download_count INTEGER DEFAULT 0');
    }
    if (!names.has('aspect_ratio')) {
      await this.client.execute('ALTER TABLE wallpapers ADD COLUMN aspect_ratio TEXT');
    }

    try {
      await this.client.execute('CREATE INDEX IF NOT EXISTS idx_aspect_ratio ON wallpapers(aspect_ratio)');
    } catch (error) {
      console.error('Failed to create aspect ratio index:', error);
    }
  }

  async getTableColumns(table) {
    const result = await this.client.execute(`PRAGMA table_info(${table})`);
    return result.rows.map(row => row.name);
  }

  async setupFts() {
    try {
      const existsResult = await this.client.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='wallpapers_fts'
      `);
      const alreadyExists = existsResult.rows.length > 0;

      await this.client.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS wallpapers_fts 
        USING fts5(filename, tags, content='wallpapers', content_rowid='id');
      `);

      const triggerSql = `
        CREATE TRIGGER IF NOT EXISTS wallpapers_ai AFTER INSERT ON wallpapers BEGIN
          INSERT INTO wallpapers_fts(rowid, filename, tags) VALUES (new.id, new.filename, COALESCE(new.tags, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS wallpapers_ad AFTER DELETE ON wallpapers BEGIN
          INSERT INTO wallpapers_fts(wallpapers_fts, rowid, filename, tags) VALUES ('delete', old.id, old.filename, old.tags);
        END;
        CREATE TRIGGER IF NOT EXISTS wallpapers_au AFTER UPDATE ON wallpapers BEGIN
          INSERT INTO wallpapers_fts(wallpapers_fts, rowid, filename, tags) VALUES ('delete', old.id, old.filename, old.tags);
          INSERT INTO wallpapers_fts(rowid, filename, tags) VALUES (new.id, new.filename, COALESCE(new.tags, ''));
        END;
      `;
      await this.client.executeMultiple(triggerSql);

      if (!alreadyExists) {
        await this.rebuildFtsIndex();
      }

      try {
        await this.client.execute('SELECT count(*) as c FROM wallpapers_fts LIMIT 1');
        this.ftsReady = true;
      } catch (verifyError) {
        console.error('FTS verification failed, disabling FTS:', verifyError);
        this.ftsReady = false;
      }
    } catch (error) {
      console.error('Failed to initialize FTS index:', error);
      this.ftsReady = false;
    }
  }

  async rebuildFtsIndex() {
    try {
      await this.client.execute(`INSERT INTO wallpapers_fts(wallpapers_fts) VALUES('rebuild')`);
    } catch (error) {
      console.error('Failed to rebuild FTS index:', error);
    }
  }

  async backfillAspectRatios() {
    try {
      const missing = await this.client.execute(`
        SELECT id, dimensions FROM wallpapers 
        WHERE aspect_ratio IS NULL OR aspect_ratio = ''
      `);

      if (!missing.rows.length) return;

      for (const row of missing.rows) {
        const aspect = computeAspectRatio(row.dimensions);
        if (!aspect) continue;
        await this.client.execute({
          sql: 'UPDATE wallpapers SET aspect_ratio = ? WHERE id = ?',
          args: [aspect, row.id]
        });
      }
    } catch (error) {
      console.error('Failed to backfill aspect ratios:', error);
    }
  }

  async consumeRateLimit(bucket, windowMs, max) {
    const now = Date.now();
    const resetAt = now + windowMs;
    try {
      const result = await this.client.execute({
        sql: `
          INSERT INTO rate_limits (bucket, count, reset_at)
          VALUES (?, 1, ?)
          ON CONFLICT(bucket) DO UPDATE SET
            count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
            reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
          RETURNING count, reset_at
        `,
        args: [bucket, resetAt, now, now, resetAt]
      });

      const row = result.rows[0] || {};
      const count = Number(row.count || 0);
      const reset = Number(row.reset_at || resetAt);

      if (Math.random() < 0.02) {
        this.client.execute({
          sql: 'DELETE FROM rate_limits WHERE reset_at <= ?',
          args: [now - windowMs]
        }).catch(() => {});
      }

      return { allowed: count <= max, count, resetAt: reset };
    } catch (error) {
      console.error('Rate limit check failed, falling back to memory:', error);
      return { allowed: true, count: 1, resetAt };
    }
  }

  async incrementDownloadCount(id) {
    try {
      await this.client.execute({
        sql: `
          UPDATE wallpapers 
          SET download_count = COALESCE(download_count, 0) + 1 
          WHERE id = ?
        `,
        args: [id]
      });
    } catch (error) {
      console.error('Failed to increment download count:', error);
    }
  }
}

module.exports = Database;
