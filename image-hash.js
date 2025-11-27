const sharp = require('sharp');

/**
 * Generate a perceptual hash for an image using difference hash (dHash) algorithm
 * This creates a hash that's resistant to minor changes like compression, scaling, etc.
 */
async function generatePerceptualHash(imagePath) {
  try {
    // Resize to 9x8 grayscale (we need 9x8 to compute 8x8 differences)
    const { data } = await sharp(imagePath)
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Convert to array for easier manipulation
    const pixels = Array.from(data);
    
    let hash = '';
    
    // Compare each pixel with the pixel to its right
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const leftPixel = pixels[row * 9 + col];
        const rightPixel = pixels[row * 9 + col + 1];
        
        // If left pixel is brighter than right, append '1', else '0'
        hash += leftPixel > rightPixel ? '1' : '0';
      }
    }
    
    // Convert binary string to hexadecimal for more compact storage
    return binaryToHex(hash);
  } catch (error) {
    console.error('Error generating perceptual hash:', error);
    throw error;
  }
}

/**
 * Convert binary string to hexadecimal
 */
function binaryToHex(binary) {
  let hex = '';
  for (let i = 0; i < binary.length; i += 4) {
    const fourBits = binary.substr(i, 4);
    hex += parseInt(fourBits, 2).toString(16);
  }
  return hex;
}

/**
 * Convert hexadecimal back to binary string
 */
function hexToBinary(hex) {
  let binary = '';
  for (let i = 0; i < hex.length; i++) {
    binary += parseInt(hex[i], 16).toString(2).padStart(4, '0');
  }
  return binary;
}

/**
 * Calculate Hamming distance between two hashes
 * Lower distance means more similar images
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return Infinity;
  }
  
  const binary1 = hexToBinary(hash1);
  const binary2 = hexToBinary(hash2);
  
  let distance = 0;
  for (let i = 0; i < binary1.length; i++) {
    if (binary1[i] !== binary2[i]) {
      distance++;
    }
  }
  
  return distance;
}

/**
 * Check if two images are similar based on their perceptual hashes
 * @param {string} hash1 - First image hash
 * @param {string} hash2 - Second image hash
 * @param {number} threshold - Similarity threshold (0-64, lower = more strict)
 * @returns {boolean} - True if images are considered similar
 */
function areSimilar(hash1, hash2, threshold = 10) {
  const distance = hammingDistance(hash1, hash2);
  return distance <= threshold;
}

/**
 * Find potential duplicates for a given hash from a list of wallpapers
 * @param {string} targetHash - Hash to compare against
 * @param {Array} wallpapers - Array of wallpaper objects with perceptual_hash property
 * @param {number} threshold - Similarity threshold
 * @returns {Array} - Array of similar wallpapers with similarity scores
 */
function findSimilarImages(targetHash, wallpapers, threshold = 10) {
  const similar = [];
  
  for (const wallpaper of wallpapers) {
    if (!wallpaper.perceptual_hash) continue;
    
    const distance = hammingDistance(targetHash, wallpaper.perceptual_hash);
    if (distance <= threshold) {
      similar.push({
        ...wallpaper,
        similarity_distance: distance,
        similarity_percentage: Math.round((1 - distance / 64) * 100)
      });
    }
  }
  
  // Sort by similarity (lower distance = more similar)
  return similar.sort((a, b) => a.similarity_distance - b.similarity_distance);
}

/**
 * Find all potential duplicate groups in a collection of wallpapers
 * HYBRID VERSION - Fast but thorough approach
 * @param {Array} wallpapers - Array of wallpaper objects with perceptual_hash
 * @param {number} threshold - Similarity threshold
 * @returns {Array} - Array of duplicate groups
 */
function findDuplicateGroups(wallpapers, threshold = 10) {
  console.log(` Starting hybrid duplicate detection for ${wallpapers.length} wallpapers...`);
  const startTime = Date.now();
  
  const validWallpapers = wallpapers.filter(w => w.perceptual_hash);
  console.log(` Processing ${validWallpapers.length} wallpapers with hashes...`);
  
  const duplicateGroups = [];
  const processed = new Set();
  
  // Process in chunks to avoid memory issues and show progress
  const CHUNK_SIZE = 500;
  let processedCount = 0;
  
  for (let i = 0; i < validWallpapers.length; i += CHUNK_SIZE) {
    const chunk = validWallpapers.slice(i, i + CHUNK_SIZE);
    const chunkStartTime = Date.now();
    
    for (const wallpaper of chunk) {
      if (processed.has(wallpaper.id)) continue;
      
      const similar = [];
      
      // Compare with ALL remaining wallpapers (but optimized)
      for (let j = i; j < validWallpapers.length; j++) {
        const other = validWallpapers[j];
        
        if (other.id === wallpaper.id || processed.has(other.id)) continue;
        
        const distance = hammingDistance(wallpaper.perceptual_hash, other.perceptual_hash);
        if (distance <= threshold) {
          similar.push({
            ...other,
            similarity_distance: distance,
            similarity_percentage: Math.round((1 - distance / 64) * 100)
          });
        }
      }
      
      if (similar.length > 0) {
        // Sort by similarity (most similar first)
        similar.sort((a, b) => a.similarity_distance - b.similarity_distance);
        
        const group = [wallpaper, ...similar];
        duplicateGroups.push(group);
        
        // Mark all in this group as processed
        group.forEach(w => processed.add(w.id));
      }
      
      processedCount++;
    }
    
    const chunkTime = Date.now() - chunkStartTime;
    console.log(` Processed chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(validWallpapers.length/CHUNK_SIZE)} in ${chunkTime}ms (${processedCount}/${validWallpapers.length} images)`);
  }
  
  const totalTime = Date.now() - startTime;
  console.log(` Hybrid duplicate detection completed in ${totalTime}ms (found ${duplicateGroups.length} groups)`);
  
  return duplicateGroups;
}

module.exports = {
  generatePerceptualHash,
  hammingDistance,
  areSimilar,
  findSimilarImages,
  findDuplicateGroups
};