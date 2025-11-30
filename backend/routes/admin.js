const path = require('path');
const fsPromises = require('fs/promises');
const sharp = require('sharp');
const config = require('../config');
const { adminAuthHook } = require('../middleware/auth');
const { 
  sanitizeFilename, 
  streamToBuffer, 
  toSafeSlug, 
  setCache, 
  buildThumbnailUrl,
  parseRepoUrl,
  fetchJson,
  fetchBuffer
} = require('../utils/helpers');
const { generatePerceptualHash, findDuplicateGroups, findSimilarImages } = require('../utils/image-hash');
const { uploadToStorage, deleteFromR2, getKeyFromUrl, getImageBuffer } = require('../services/storage');
const { scanOsuSongsDirectory, formatTagsForDb, generateDisplayTitle, generateCleanFilename } = require('../utils/osu-parser');

/**
 * Register admin routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} db - Database instance
 */
async function registerAdminRoutes(fastify, db) {
  // Admin: upload new wallpapers
  fastify.post('/api/upload', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      const parts = request.parts();
      const formFields = {
        provider: null,
        folder: null,
        tags: null
      };
      const uploaded = [];
      const errors = [];
      const files = [];

      for await (const part of parts) {
        if (part.type === 'file') {
          try {
            const originalName = sanitizeFilename(part.filename || `upload-${Date.now()}.jpg`);
            const buffer = await streamToBuffer(part.file);
            files.push({ originalName, buffer });
          } catch (error) {
            errors.push({ filename: part.filename, error: error.message });
          }
        } else if (part.type === 'field') {
          if (Object.prototype.hasOwnProperty.call(formFields, part.fieldname)) {
            formFields[part.fieldname] = part.value;
          }
        }
      }

      if (files.length === 0) {
        reply.code(400);
        return { success: false, error: 'No files received' };
      }

      for (const file of files) {
        try {
          const meta = await sharp(file.buffer).metadata();
          const dimensions = meta.width && meta.height ? `${meta.width}x${meta.height}` : null;
          const fileSize = file.buffer.length;
          const hash = await generatePerceptualHash(file.buffer);

          const timestamp = Date.now();
          const baseName = `${timestamp}-${file.originalName}`;
          const imageKey = `images/${baseName}`;
          const thumbKey = `thumbnails/${path.basename(baseName, path.extname(baseName))}.jpg`;

          // Upload original
          const downloadUrl = await uploadToStorage(imageKey, file.buffer, meta.format ? `image/${meta.format}` : 'application/octet-stream', false);

          // Upload thumbnail (JPEG)
          const thumbBuffer = await sharp(file.buffer)
            .resize({ width: 900, height: 900, fit: 'inside' })
            .jpeg({ quality: 82 })
            .toBuffer();
          const thumbUrl = await uploadToStorage(thumbKey, thumbBuffer, 'image/jpeg', true);

          const record = {
            filename: baseName,
            provider: formFields.provider || 'manual',
            folder: formFields.folder || null,
            file_size: fileSize,
            dimensions,
            download_url: downloadUrl,
            local_path: config.STORAGE_MODE === 'local' ? path.join('downloads', baseName) : null,
            tags: formFields.tags || null,
            perceptual_hash: hash
          };

          const insertedId = await db.insertWallpaper(record);
          uploaded.push({
            id: insertedId,
            filename: baseName,
            download_url: downloadUrl,
            thumbnail_url: thumbUrl,
            perceptual_hash: hash
          });
        } catch (error) {
          errors.push({ filename: file.originalName, error: error.message });
        }
      }

      return {
        success: errors.length === 0,
        uploaded,
        errors
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin: GitHub import preview
  fastify.post('/api/import/repo/preview', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      const { repoUrl, branch, limit = 10 } = request.body || {};
      const parsed = parseRepoUrl(repoUrl || '');
      if (!parsed) {
        reply.code(400);
        return { success: false, error: 'Invalid repo URL' };
      }

      const repoMeta = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, config.GITHUB_TOKEN);
      const branchName = branch || repoMeta.default_branch || 'main';

      const tree = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branchName}?recursive=1`, config.GITHUB_TOKEN);
      const files = (tree.tree || []).filter(item => item.type === 'blob' && item.path && item.path.match(/\.(jpg|jpeg|png|webp|gif)$/i));

      const byFolder = {};
      const samples = [];

      files.forEach((file) => {
        const parts = file.path.split('/');
        const folder = parts.length > 1 ? parts[0] : '';
        byFolder[folder] = (byFolder[folder] || 0) + 1;
      });

      files.slice(0, Math.max(1, Math.min(limit, 25))).forEach((file) => {
        const parts = file.path.split('/');
        const folder = parts.length > 1 ? parts[0] : '';
        samples.push({
          filename: path.basename(file.path),
          folder,
          path: file.path,
          size: file.size,
          raw_url: `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branchName}/${file.path}`
        });
      });

      return {
        success: true,
        provider_suggested: parsed.owner || parsed.repo,
        branch: branchName,
        total_images: files.length,
        by_folder: byFolder,
        sample: samples
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin: GitHub import
  fastify.post('/api/import/repo/import', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      const { repoUrl, branch, provider, folderStrategy = 'top-level' } = request.body || {};
      const parsed = parseRepoUrl(repoUrl || '');
      if (!parsed) {
        reply.code(400);
        return { success: false, error: 'Invalid repo URL' };
      }

      const repoMeta = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, config.GITHUB_TOKEN);
      const branchName = branch || repoMeta.default_branch || 'main';

      const tree = await fetchJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branchName}?recursive=1`, config.GITHUB_TOKEN);
      const files = (tree.tree || []).filter(item => item.type === 'blob' && item.path && item.path.match(/\.(jpg|jpeg|png|webp|gif)$/i));

      const providerName = provider || parsed.repo;
      const providerSlug = toSafeSlug(providerName) || 'repo';
      const results = { imported: [], skipped: [], failed: [] };

      for (const file of files) {
        try {
          const parts = file.path.split('/');
          const folder = parts.length > 1 ? parts[0] : '';
          const filename = path.basename(file.path);
          const finalFolder = folderStrategy === 'top-level' ? folder || null : null;

          // Skip if already in DB
          const existing = await db.getWallpapers({ provider: providerName, folder: finalFolder, filename });
          if (existing.length > 0) {
            results.skipped.push({ filename, reason: 'exists' });
            continue;
          }

          const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branchName}/${file.path}`;
          const buffer = await fetchBuffer(rawUrl, config.GITHUB_TOKEN);
          const meta = await sharp(buffer).metadata();
          const dimensions = meta.width && meta.height ? `${meta.width}x${meta.height}` : null;
          const fileSize = buffer.length;
          const hash = await generatePerceptualHash(buffer);

          const safeFolder = finalFolder ? toSafeSlug(finalFolder) : '';
          const uniqueName = `${Date.now()}-${sanitizeFilename(filename)}`;
          const imageKey = `images/${providerSlug}${safeFolder ? `/${safeFolder}` : ''}/${uniqueName}`;
          const thumbKey = `thumbnails/${providerSlug}${safeFolder ? `/${safeFolder}` : ''}/${path.basename(uniqueName, path.extname(uniqueName))}.jpg`;

          const downloadUrl = await uploadToStorage(imageKey, buffer, meta.format ? `image/${meta.format}` : 'application/octet-stream', false);
          const thumbBuffer = await sharp(buffer).resize({ width: 900, height: 900, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
          const thumbUrl = await uploadToStorage(thumbKey, thumbBuffer, 'image/jpeg', true);

          const record = {
            filename,
            provider: providerName,
            folder: finalFolder,
            file_size: fileSize,
            dimensions,
            download_url: downloadUrl,
            local_path: config.STORAGE_MODE === 'local' ? path.join('downloads', path.basename(imageKey)) : null,
            tags: finalFolder ? `["${finalFolder}"]` : null,
            perceptual_hash: hash
          };

          const insertedId = await db.insertWallpaper(record);
          results.imported.push({
            id: insertedId,
            filename,
            folder: finalFolder,
            download_url: downloadUrl,
            thumbnail_url: thumbUrl
          });
        } catch (error) {
          results.failed.push({ filename: file.path, error: error.message });
        }
      }

      return { success: true, ...results };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin: duplicate detection status
  fastify.get('/api/duplicates/status', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      const status = await db.getHashStatus();
      setCache(reply, 60);
      return { success: true, status };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin: get duplicates
  fastify.get('/api/duplicates', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      const threshold = Math.max(1, Math.min(parseInt(request.query.threshold) || 10, 64));
      const wallpapers = await db.getAllWallpapersWithHashes();
      const duplicateGroups = findDuplicateGroups(wallpapers, threshold).map(group => 
        group.map(w => ({
          ...w,
          image_url: w.download_url,
          thumbnail_url: buildThumbnailUrl(w.download_url)
        }))
      );

      setCache(reply, 60);

      return {
        success: true,
        duplicateGroups,
        totalGroups: duplicateGroups.length,
        totalDuplicates: duplicateGroups.reduce((sum, group) => sum + group.length, 0)
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin: generate hashes for wallpapers without them
  fastify.post('/api/duplicates/generate-hashes', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      const missing = await db.getAllWallpapersWithoutHashes();
      let updated = 0;
      const failed = [];

      for (const wallpaper of missing) {
        try {
          const buffer = await getImageBuffer(wallpaper, fastify.log);
          const hash = await generatePerceptualHash(buffer);
          await db.updatePerceptualHash(wallpaper.id, hash);
          updated += 1;
        } catch (error) {
          failed.push({ id: wallpaper.id, error: error.message });
        }
      }

      return { success: true, processed: missing.length, updated, failed };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin: delete wallpaper
  fastify.delete('/api/wallpapers/:id', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      const { deleteFile } = request.query;
      const wallpaper = await db.getWallpaperById(request.params.id);

      if (!wallpaper) {
        reply.code(404);
        return { success: false, error: 'Wallpaper not found' };
      }

      if (deleteFile === 'true') {
        const mainKey = getKeyFromUrl(wallpaper.download_url);
        const thumbUrl = buildThumbnailUrl(wallpaper.download_url);
        const thumbKey = thumbUrl ? getKeyFromUrl(thumbUrl) : null;
        await deleteFromR2([mainKey, thumbKey], fastify.log);
      }

      const deleted = await db.deleteWallpaper(wallpaper.id);
      if (!deleted) {
        reply.code(500);
        return { success: false, error: 'Failed to delete wallpaper' };
      }

      return { success: true, deleted: wallpaper.id, removedFromStorage: deleteFile === 'true' && config.R2_ENABLED };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Admin: osu! scan - scan Songs directory and return beatmap list with SSE progress
  fastify.get('/api/osu/scan', { onRequest: [adminAuthHook] }, async (request, reply) => {
    const { songsPath, maxFiles } = request.query || {};
    const maxFilesLimit = maxFiles ? parseInt(maxFiles) : null;
    
    if (!songsPath) {
      reply.code(400);
      return { success: false, error: 'Songs path is required' };
    }

    // Verify the path exists
    try {
      const stats = await fsPromises.stat(songsPath);
      if (!stats.isDirectory()) {
        reply.code(400);
        return { success: false, error: 'Path is not a directory' };
      }
    } catch (err) {
      reply.code(400);
      return { success: false, error: 'Directory not found or not accessible' };
    }

    // Set up SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const sendEvent = (event, data) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Phase 1: Scan directories
      sendEvent('progress', { phase: 'scanning', message: 'Scanning osu! Songs directory...', percent: 0 });
      
      let beatmaps = await scanOsuSongsDirectory(songsPath, (progress) => {
        sendEvent('progress', { 
          phase: 'scanning', 
          message: `Scanning folders: ${progress.current}/${progress.total}`,
          percent: Math.round((progress.current / progress.total) * 30), // 0-30%
          found: progress.found
        });
      });

      // Apply max files limit if specified
      if (maxFilesLimit && maxFilesLimit > 0 && beatmaps.length > maxFilesLimit) {
        beatmaps = beatmaps.slice(0, maxFilesLimit);
        sendEvent('progress', { phase: 'hashing', message: `Limited to ${maxFilesLimit} beatmaps. Loading existing hashes...`, percent: 30 });
      } else {
        sendEvent('progress', { phase: 'hashing', message: `Found ${beatmaps.length} beatmaps. Loading existing hashes...`, percent: 30 });
      }

      // Get existing wallpapers with hashes for duplicate detection
      const existingWallpapers = await db.getAllWallpapersWithHashes();
      
      sendEvent('progress', { phase: 'processing', message: 'Processing beatmaps...', percent: 35 });

      // Process beatmaps in parallel batches for speed
      const processedBeatmaps = [];
      const total = beatmaps.length;
      const BATCH_SIZE = 20; // Process 20 at a time for good balance of speed vs memory
      
      const processSingleBeatmap = async (beatmap) => {
        try {
          // Read the background image
          const buffer = await fsPromises.readFile(beatmap.backgroundPath);
          
          // Run hash, metadata, and thumbnail generation in parallel
          // Use failOn: 'none' to handle files with mismatched extensions (e.g., BMP saved as .jpg)
          const [hash, sharpMeta, thumbBuffer] = await Promise.all([
            generatePerceptualHash(buffer),
            sharp(buffer, { failOn: 'none' }).metadata(),
            sharp(buffer, { failOn: 'none' })
              .resize({ width: 300, height: 200, fit: 'cover' })
              .jpeg({ quality: 70 })
              .toBuffer()
          ]);
          
          // Skip if hash generation failed (unsupported format)
          if (!hash) {
            console.log(`Skipping ${beatmap.folderName}: unsupported image format`);
            return null;
          }
          
          // Check for similar existing images
          const similar = findSimilarImages(hash, existingWallpapers, 10);
          const hasDuplicate = similar.length > 0;
          
          const dimensions = sharpMeta.width && sharpMeta.height 
            ? `${sharpMeta.width}x${sharpMeta.height}` 
            : null;

          const thumbBase64 = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;

          // Generate unique ID using folder name + background filename to ensure uniqueness
          // beatmapSetId can be shared across multiple difficulties, so we can't use it alone
          const uniqueId = `${beatmap.folderName}::${beatmap.backgroundFilename}`;

          // Generate clean filename for display and import
          const cleanFilename = generateCleanFilename(beatmap.metadata, beatmap.backgroundFilename);

          return {
            id: uniqueId,
            folderName: beatmap.folderName,
            folderPath: beatmap.folderPath,
            backgroundPath: beatmap.backgroundPath,
            backgroundFilename: beatmap.backgroundFilename,
            fileSize: beatmap.fileSize,
            dimensions,
            perceptualHash: hash,
            thumbnail: thumbBase64,
            metadata: beatmap.metadata,
            displayTitle: generateDisplayTitle(beatmap.metadata),
            cleanFilename,
            hasDuplicate,
            duplicateOf: hasDuplicate ? similar[0] : null,
            selected: !hasDuplicate // Pre-deselect duplicates
          };
        } catch (err) {
          console.error(`Error processing beatmap ${beatmap.folderName}:`, err.message);
          return null;
        }
      };

      // Process in batches
      for (let i = 0; i < beatmaps.length; i += BATCH_SIZE) {
        const batch = beatmaps.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(processSingleBeatmap));
        
        // Add successful results
        for (const result of batchResults) {
          if (result) {
            processedBeatmaps.push(result);
          }
        }
        
        // Send progress update after each batch
        const processed = Math.min(i + BATCH_SIZE, total);
        const percent = 35 + Math.round((processed / total) * 60); // 35-95%
        sendEvent('progress', { 
          phase: 'processing', 
          message: `Processing: ${processed}/${total}`,
          percent,
          processed,
          total
        });
      }

      // Sort by title
      sendEvent('progress', { phase: 'finalizing', message: 'Sorting results...', percent: 98 });
      processedBeatmaps.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));

      // Send final result
      sendEvent('complete', {
        success: true,
        total: processedBeatmaps.length,
        withDuplicates: processedBeatmaps.filter(b => b.hasDuplicate).length,
        beatmaps: processedBeatmaps
      });

    } catch (error) {
      sendEvent('error', { success: false, error: error.message });
    } finally {
      reply.raw.end();
    }
  });

  // Admin: osu! import - import selected beatmaps
  fastify.post('/api/osu/import', { onRequest: [adminAuthHook] }, async (request, reply) => {
    try {
      console.log('=== osu! import started ===');
      const { beatmaps, provider = 'osu' } = request.body || {};
      
      console.log(`Received ${beatmaps?.length || 0} beatmaps, provider: ${provider}`);
      
      if (!beatmaps || !Array.isArray(beatmaps) || beatmaps.length === 0) {
        reply.code(400);
        return { success: false, error: 'No beatmaps provided for import' };
      }

      const providerSlug = toSafeSlug(provider);
      const results = { imported: [], skipped: [], failed: [] };

      // Filter to only selected beatmaps
      const selectedBeatmaps = beatmaps.filter(b => b.selected);
      const skippedBeatmaps = beatmaps.filter(b => !b.selected);
      
      console.log(`Selected: ${selectedBeatmaps.length}, Skipped: ${skippedBeatmaps.length}`);
      
      // Add skipped to results
      skippedBeatmaps.forEach(b => {
        results.skipped.push({ displayTitle: b.displayTitle, reason: 'not selected' });
      });

      // Track used filenames to handle duplicates (only add suffix when needed)
      const usedFilenames = new Set();

      // Process in parallel batches of 5 for optimal speed without overwhelming R2
      const BATCH_SIZE = 5;
      
      const processBeatmap = async (beatmap, index) => {
        try {
          // Read the image file
          const buffer = await fsPromises.readFile(beatmap.backgroundPath);
          
          // Get metadata - use failOn: 'none' to handle files with mismatched extensions
          const meta = await sharp(buffer, { failOn: 'none' }).metadata();
          const dimensions = meta.width && meta.height ? `${meta.width}x${meta.height}` : null;
          const fileSize = buffer.length;
          const hash = beatmap.perceptualHash || await generatePerceptualHash(buffer);

          // Generate clean short filename from metadata or original filename
          const cleanBase = beatmap.cleanFilename || generateCleanFilename(beatmap.metadata, beatmap.backgroundFilename);
          const ext = path.extname(beatmap.backgroundFilename) || '.jpg';
          
          // Only add suffix if filename already exists
          let uniqueName = `${cleanBase}${ext}`;
          if (usedFilenames.has(uniqueName.toLowerCase())) {
            const suffix = Math.random().toString(36).substring(2, 6);
            uniqueName = `${cleanBase}_${suffix}${ext}`;
          }
          usedFilenames.add(uniqueName.toLowerCase());

          // Upload paths
          const imageKey = `images/${providerSlug}/${uniqueName}`;
          const thumbKey = `thumbnails/${providerSlug}/${path.basename(uniqueName, ext)}.jpg`;

          // Generate thumbnail - use failOn: 'none' to handle files with mismatched extensions
          const thumbBuffer = await sharp(buffer, { failOn: 'none' })
            .resize({ width: 900, height: 900, fit: 'inside' })
            .jpeg({ quality: 82 })
            .toBuffer();

          // Upload both in parallel
          const [downloadUrl, thumbUrl] = await Promise.all([
            uploadToStorage(imageKey, buffer, meta.format ? `image/${meta.format}` : 'application/octet-stream', false),
            uploadToStorage(thumbKey, thumbBuffer, 'image/jpeg', true)
          ]);

          // Format tags
          const tags = formatTagsForDb(beatmap.metadata);

          // Create database record
          const record = {
            filename: uniqueName,
            provider: provider,
            folder: beatmap.metadata.source || null,
            file_size: fileSize,
            dimensions,
            download_url: downloadUrl,
            local_path: config.STORAGE_MODE === 'local' ? path.join('downloads', uniqueName) : null,
            tags,
            perceptual_hash: hash
          };

          const insertedId = await db.insertWallpaper(record);
          
          return {
            success: true,
            data: {
              id: insertedId,
              displayTitle: beatmap.displayTitle,
              filename: uniqueName,
              download_url: downloadUrl,
              thumbnail_url: thumbUrl
            }
          };
        } catch (error) {
          console.error(`Error processing beatmap ${beatmap.displayTitle}:`, error.message);
          return {
            success: false,
            error: { displayTitle: beatmap.displayTitle, error: error.message }
          };
        }
      };

      // Process in batches
      for (let i = 0; i < selectedBeatmaps.length; i += BATCH_SIZE) {
        const batch = selectedBeatmaps.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map((beatmap, idx) => processBeatmap(beatmap, i + idx))
        );
        
        // Collect results
        batchResults.forEach(result => {
          if (result.success) {
            results.imported.push(result.data);
          } else {
            results.failed.push(result.error);
          }
        });
      }

      return { 
        success: true, 
        ...results,
        summary: {
          total: beatmaps.length,
          imported: results.imported.length,
          skipped: results.skipped.length,
          failed: results.failed.length
        }
      };
    } catch (error) {
      console.error('osu! import error:', error.message);
      console.error('Stack trace:', error.stack);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerAdminRoutes;
