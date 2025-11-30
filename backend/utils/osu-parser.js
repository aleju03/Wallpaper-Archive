const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// Supported image extensions that Sharp can process
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff', '.avif'];

/**
 * Check if a filename has a supported image extension
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if supported image format
 */
function isSupportedImageFormat(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Parse a single .osu file and extract metadata and background filename
 * @param {string} osuFilePath - Path to the .osu file
 * @returns {Promise<Object>} - Parsed metadata
 */
async function parseOsuFile(osuFilePath) {
  const content = await fsPromises.readFile(osuFilePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  
  const metadata = {
    title: null,
    titleUnicode: null,
    artist: null,
    artistUnicode: null,
    creator: null,
    version: null,
    source: null,
    tags: [],
    beatmapId: null,
    beatmapSetId: null,
    backgroundFilename: null
  };

  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for section headers
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).toLowerCase();
      continue;
    }

    // Parse metadata section
    if (currentSection === 'metadata') {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
        const value = trimmed.slice(colonIndex + 1).trim();
        
        switch (key) {
          case 'title':
            metadata.title = value;
            break;
          case 'titleunicode':
            metadata.titleUnicode = value;
            break;
          case 'artist':
            metadata.artist = value;
            break;
          case 'artistunicode':
            metadata.artistUnicode = value;
            break;
          case 'creator':
            metadata.creator = value;
            break;
          case 'version':
            metadata.version = value;
            break;
          case 'source':
            metadata.source = value;
            break;
          case 'tags':
            // Split tags by space, filter empty
            metadata.tags = value.split(/\s+/).filter(t => t.length > 0);
            break;
          case 'beatmapid':
            metadata.beatmapId = value;
            break;
          case 'beatmapsetid':
            metadata.beatmapSetId = value;
            break;
        }
      }
    }

    // Parse events section for background image
    if (currentSection === 'events') {
      // Background format: 0,0,"filename",xOffset,yOffset
      // or Video,startTime,"filename" (we want to skip videos)
      const bgMatch = trimmed.match(/^0,0,"([^"]+)"/);
      if (bgMatch) {
        metadata.backgroundFilename = bgMatch[1];
      }
    }
  }

  return metadata;
}

/**
 * Scan a beatmap folder and extract all relevant information
 * @param {string} beatmapFolder - Path to the beatmap folder
 * @returns {Promise<Object|null>} - Beatmap info or null if invalid
 */
async function scanBeatmapFolder(beatmapFolder) {
  try {
    const files = await fsPromises.readdir(beatmapFolder);
    
    // Find the first .osu file
    const osuFile = files.find(f => f.endsWith('.osu'));
    if (!osuFile) {
      return null;
    }

    const osuFilePath = path.join(beatmapFolder, osuFile);
    const metadata = await parseOsuFile(osuFilePath);

    // Check if background file exists and is a supported image format
    if (!metadata.backgroundFilename) {
      return null;
    }

    // Skip unsupported formats (videos, bmp, etc.)
    if (!isSupportedImageFormat(metadata.backgroundFilename)) {
      return null;
    }

    const backgroundPath = path.join(beatmapFolder, metadata.backgroundFilename);
    
    try {
      await fsPromises.access(backgroundPath, fs.constants.R_OK);
    } catch {
      // Background file doesn't exist
      return null;
    }

    // Get file stats for the background
    const stats = await fsPromises.stat(backgroundPath);
    
    // Extract folder name (usually "{beatmapSetId} {Artist} - {Title}")
    const folderName = path.basename(beatmapFolder);

    return {
      folderName,
      folderPath: beatmapFolder,
      backgroundPath,
      backgroundFilename: metadata.backgroundFilename,
      fileSize: stats.size,
      metadata: {
        title: metadata.titleUnicode || metadata.title,
        artist: metadata.artistUnicode || metadata.artist,
        creator: metadata.creator,
        source: metadata.source,
        tags: metadata.tags,
        beatmapSetId: metadata.beatmapSetId
      }
    };
  } catch (error) {
    console.error(`Error scanning beatmap folder ${beatmapFolder}:`, error.message);
    return null;
  }
}

/**
 * Scan entire osu! Songs directory
 * @param {string} songsPath - Path to osu! Songs directory
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array>} - Array of beatmap info objects
 */
async function scanOsuSongsDirectory(songsPath, progressCallback = null) {
  const beatmaps = [];
  
  try {
    const folders = await fsPromises.readdir(songsPath, { withFileTypes: true });
    const beatmapFolders = folders.filter(f => f.isDirectory());
    const total = beatmapFolders.length;
    
    // Process folders in parallel batches of 50 for speed
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < beatmapFolders.length; i += BATCH_SIZE) {
      const batch = beatmapFolders.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(folder => {
          const folderPath = path.join(songsPath, folder.name);
          return scanBeatmapFolder(folderPath);
        })
      );
      
      // Add valid results
      for (const result of batchResults) {
        if (result) {
          beatmaps.push(result);
        }
      }

      if (progressCallback) {
        const processed = Math.min(i + BATCH_SIZE, total);
        progressCallback({
          current: processed,
          total,
          found: beatmaps.length,
          percentage: Math.round((processed / total) * 100)
        });
      }
    }

    return beatmaps;
  } catch (error) {
    console.error('Error scanning osu! Songs directory:', error.message);
    throw error;
  }
}

/**
 * Format tags for database storage
 * Combines source and tags into a JSON array string
 * @param {Object} metadata - Beatmap metadata
 * @returns {string} - JSON array string of tags
 */
function formatTagsForDb(metadata) {
  const allTags = new Set();

  // Add source as a tag if present
  if (metadata.source && metadata.source.trim()) {
    allTags.add(metadata.source.trim());
  }

  // Add all individual tags
  if (metadata.tags && Array.isArray(metadata.tags)) {
    for (const tag of metadata.tags) {
      if (tag && tag.trim()) {
        allTags.add(tag.trim());
      }
    }
  }

  // Add artist and creator as tags
  if (metadata.artist) {
    allTags.add(metadata.artist);
  }
  if (metadata.creator) {
    allTags.add(metadata.creator);
  }

  // Convert to array and JSON stringify
  const tagsArray = Array.from(allTags);
  return tagsArray.length > 0 ? JSON.stringify(tagsArray) : null;
}

/**
 * Generate a display title for a beatmap
 * @param {Object} metadata - Beatmap metadata
 * @returns {string} - Formatted title
 */
function generateDisplayTitle(metadata) {
  const artist = metadata.artist || 'Unknown Artist';
  const title = metadata.title || 'Unknown Title';
  return `${artist} - ${title}`;
}

/**
 * Check if a filename is generic (like "background", "bg", etc.)
 * @param {string} filename - The filename to check (without extension)
 * @returns {boolean} - True if the filename is generic
 */
function isGenericFilename(filename) {
  if (!filename) return true;
  const base = filename.toLowerCase().replace(/\.[^.]+$/, ''); // Remove extension
  const genericNames = ['background', 'bg', 'bga', 'b_g_e', 'title', 'image', 'pic', 'picture', 'wallpaper', 'cover'];
  return genericNames.includes(base) || /^\d+$/.test(base); // Also match pure numbers
}

/**
 * Generate a clean short filename from beatmap metadata
 * Returns 1-2 words, letters only, separated by underscore
 * @param {Object} metadata - Beatmap metadata
 * @param {string} originalFilename - Original background filename
 * @returns {string} - Clean short filename (without extension)
 */
function generateCleanFilename(metadata, originalFilename) {
  // If original filename is not generic, use it (cleaned up)
  if (originalFilename && !isGenericFilename(originalFilename)) {
    const base = originalFilename.replace(/\.[^.]+$/, ''); // Remove extension
    // Clean: only letters, convert to lowercase, limit length
    const cleaned = base
      .replace(/[^a-zA-Z\s_-]/g, '') // Keep only letters, spaces, underscores, hyphens
      .replace(/[\s_-]+/g, '_')       // Convert spaces/underscores/hyphens to single underscore
      .toLowerCase()
      .replace(/^_+|_+$/g, '');       // Trim underscores
    
    if (cleaned.length >= 3) {
      // Take first 2 words max
      const words = cleaned.split('_').filter(w => w.length > 0).slice(0, 2);
      return words.join('_');
    }
  }

  // Generate from metadata: prefer artist_title or just title
  const artist = (metadata.artist || '')
    .replace(/[^a-zA-Z\s]/g, '')  // Only letters and spaces
    .trim()
    .split(/\s+/)                  // Split into words
    .filter(w => w.length > 0)
    .slice(0, 2)                   // Take first 2 words of artist
    .join('_')
    .toLowerCase();

  const title = (metadata.title || '')
    .replace(/[^a-zA-Z\s]/g, '')  // Only letters and spaces
    .trim()
    .split(/\s+/)                  // Split into words
    .filter(w => w.length > 0)
    .slice(0, 2)                   // Take first 2 words of title
    .join('_')
    .toLowerCase();

  // Combine: artist_title, or just one if the other is empty
  if (artist && title) {
    return `${artist}_${title}`;
  } else if (artist) {
    return artist;
  } else if (title) {
    return title;
  } else {
    // Fallback to random short string
    return `img_${Date.now().toString(36)}`;
  }
}

module.exports = {
  parseOsuFile,
  scanBeatmapFolder,
  scanOsuSongsDirectory,
  formatTagsForDb,
  generateDisplayTitle,
  generateCleanFilename,
  isGenericFilename
};
