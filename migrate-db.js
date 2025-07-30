const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = './wallpapers.db';

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.log('Database does not exist yet. No migration needed.');
  process.exit(0);
}

const db = new sqlite3.Database(dbPath);

// Check if perceptual_hash column exists
db.all("PRAGMA table_info(wallpapers)", (err, columns) => {
  if (err) {
    console.error('Error checking table info:', err);
    process.exit(1);
  }

  const hasPerceptualHash = columns.some(col => col.name === 'perceptual_hash');
  
  if (hasPerceptualHash) {
    console.log('perceptual_hash column already exists. No migration needed.');
    db.close();
    process.exit(0);
  }

  console.log('Adding perceptual_hash column to wallpapers table...');
  
  db.run("ALTER TABLE wallpapers ADD COLUMN perceptual_hash TEXT", (err) => {
    if (err) {
      console.error('Error adding perceptual_hash column:', err);
      process.exit(1);
    }
    
    console.log('Successfully added perceptual_hash column.');
    
    // Create index for the new column
    db.run("CREATE INDEX IF NOT EXISTS idx_perceptual_hash ON wallpapers(perceptual_hash)", (err) => {
      if (err) {
        console.error('Error creating index:', err);
        process.exit(1);
      }
      
      console.log('Successfully created index for perceptual_hash.');
      db.close();
      console.log('Migration completed successfully!');
    });
  });
});