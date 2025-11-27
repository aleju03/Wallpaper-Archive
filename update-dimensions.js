const sharp = require('sharp');
const fs = require('fs').promises;
const Database = require('./database');

async function updateDimensions() {
  const db = new Database();
  
  try {
    // Get all wallpapers with NULL dimensions
    const wallpapers = await db.getWallpapers();
    const nullDimensionWallpapers = wallpapers.filter(w => !w.dimensions);
    
    console.log(`Found ${nullDimensionWallpapers.length} wallpapers without dimensions`);
    
    let updated = 0;
    let errors = 0;
    
    for (const wallpaper of nullDimensionWallpapers) {
      try {
        // Check if file exists
        await fs.access(wallpaper.local_path);
        
        // Extract dimensions
        const metadata = await sharp(wallpaper.local_path).metadata();
        const dimensions = `${metadata.width}x${metadata.height}`;
        
        // Update database
        await new Promise((resolve, reject) => {
          db.db.run(
            'UPDATE wallpapers SET dimensions = ? WHERE id = ?',
            [dimensions, wallpaper.id],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        console.log(` Updated ${wallpaper.filename}: ${dimensions}`);
        updated++;
        
      } catch (error) {
        console.error(` Error processing ${wallpaper.filename}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n--- Update Complete ---`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors: ${errors}`);
    
  } catch (error) {
    console.error('Error updating dimensions:', error);
  } finally {
    db.close();
  }
}

updateDimensions();