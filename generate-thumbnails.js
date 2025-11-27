const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const Database = require('./database');

const db = new Database();

async function generateThumbnail(imagePath, thumbnailPath) {
  try {
    await sharp(imagePath)
      .resize(600, 400, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    return true;
  } catch (error) {
    console.error(`Error generating thumbnail for ${imagePath}:`, error.message);
    return false;
  }
}

async function generateAllThumbnails() {
  try {
    // Ensure thumbnails directory exists
    await fs.mkdir('./thumbnails', { recursive: true });
    
    // Get all wallpapers from database
    console.log('🔍 Fetching wallpapers from database...');
    const wallpapers = await db.getWallpapers();
    console.log(`📊 Found ${wallpapers.length} wallpapers in database`);
    
    let generated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (let i = 0; i < wallpapers.length; i++) {
      const wallpaper = wallpapers[i];
      const progress = `[${i + 1}/${wallpapers.length}]`;
      
      if (!wallpaper.local_path) {
        console.log(`${progress} ⚠️  No local path for: ${wallpaper.filename}`);
        skipped++;
        continue;
      }
      
      // Check if original file exists
      try {
        await fs.access(wallpaper.local_path);
      } catch (error) {
        console.log(`${progress} ❌ Original file not found: ${wallpaper.local_path}`);
        errors++;
        continue;
      }
      
      // Generate thumbnail path
      const originalExt = path.extname(wallpaper.local_path);
      const originalName = path.basename(wallpaper.local_path, originalExt);
      const thumbnailPath = path.join('./thumbnails', `${originalName}.jpg`);
      
      // Check if thumbnail already exists
      try {
        await fs.access(thumbnailPath);
        console.log(`${progress} ✅ Thumbnail exists: ${originalName}.jpg`);
        skipped++;
        continue;
      } catch (error) {
        // Thumbnail doesn't exist, create it
      }
      
      // Generate thumbnail
      console.log(`${progress} 🔄 Generating: ${originalName}.jpg`);
      const success = await generateThumbnail(wallpaper.local_path, thumbnailPath);
      
      if (success) {
        generated++;
        console.log(`${progress} ✅ Generated: ${originalName}.jpg`);
      } else {
        errors++;
        console.log(`${progress} ❌ Failed: ${originalName}.jpg`);
      }
      
      // Add small delay to prevent overwhelming the system
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('\\n📈 Summary:');
    console.log(`✅ Generated: ${generated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📁 Total processed: ${wallpapers.length}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    process.exit(0);
  }
}

// Run the script
console.log('🚀 Starting thumbnail generation...');
generateAllThumbnails();