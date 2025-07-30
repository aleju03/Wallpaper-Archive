const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const Database = require('./database');

class OsuLocalProvider {
  constructor() {
    this.db = new Database();
    this.downloadDir = './downloads';
    this.thumbnailDir = './thumbnails';
    this.osuFilesPath = '/home/aleju/.local/share/osu/files';
    this.providerName = 'Osu! Local Backgrounds';
    
    // Target wallpaper resolutions (width x height)
    this.targetResolutions = [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 3840, height: 2160 },
      { width: 1366, height: 768 },
      { width: 1600, height: 900 },
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1680, height: 1050 },
      { width: 2048, height: 1152 },
      { width: 2560, height: 1600 }
    ];
    
    this.minWidth = 800;
    this.maxTransparency = 0.1; // Max 10% transparency
  }

  async init() {
    await fs.mkdir(this.downloadDir, { recursive: true });
    await fs.mkdir(this.thumbnailDir, { recursive: true });
  }

  async scanOsuFiles() {
    console.log('Starting osu! files scan...');
    const imageFiles = [];
    
    try {
      const hexDirs = await fs.readdir(this.osuFilesPath);
      
      for (const hexDir of hexDirs) {
        if (!/^[0-9a-f]$/.test(hexDir)) continue;
        
        const hexDirPath = path.join(this.osuFilesPath, hexDir);
        const subDirs = await fs.readdir(hexDirPath);
        
        for (const subDir of subDirs) {
          if (!/^[0-9a-f]{2}$/.test(subDir)) continue;
          
          const subDirPath = path.join(hexDirPath, subDir);
          const files = await fs.readdir(subDirPath);
          
          console.log(`Scanning directory: ${hexDir}/${subDir} (${files.length} files)`);
          
          for (const file of files) {
            const filePath = path.join(subDirPath, file);
            const imageInfo = await this.analyzeImage(filePath);
            
            if (imageInfo) {
              imageFiles.push({
                ...imageInfo,
                hashPath: filePath,
                hashName: file,
                folder: `${hexDir}/${subDir}`
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning osu files:', error);
    }
    
    console.log(`Found ${imageFiles.length} potential background images`);
    return imageFiles;
  }

  async analyzeImage(filePath) {
    try {
      // Try to get metadata with sharp
      const metadata = await sharp(filePath).metadata();
      
      // Check if it's an image we can process
      if (!metadata.width || !metadata.height) {
        return null;
      }
      
      // Filter by minimum size
      if (metadata.width < this.minWidth) {
        return null;
      }
      
      // Check aspect ratio - prefer landscape orientation
      const aspectRatio = metadata.width / metadata.height;
      if (aspectRatio < 1.0) {
        return null; // Skip portrait images
      }
      
      // Check if it matches common wallpaper resolutions or is reasonably large
      const isCommonResolution = this.targetResolutions.some(res => 
        Math.abs(metadata.width - res.width) <= 10 && 
        Math.abs(metadata.height - res.height) <= 10
      );
      
      const isLargeEnough = metadata.width >= 1280 && metadata.height >= 720;
      
      if (!isCommonResolution && !isLargeEnough) {
        return null;
      }
      
      // Check for transparency (skip UI elements)
      if (await this.hasSignificantTransparency(filePath, metadata)) {
        return null;
      }
      
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        channels: metadata.channels,
        hasAlpha: metadata.channels === 4 || metadata.hasAlpha
      };
      
    } catch (error) {
      // Not an image file or corrupted, skip it
      return null;
    }
  }

  async hasSignificantTransparency(filePath, metadata) {
    try {
      // Only check PNG files for transparency
      if (metadata.format !== 'png' || !metadata.hasAlpha) {
        return false;
      }
      
      // Sample the image to check transparency
      const { data, info } = await sharp(filePath)
        .resize(100, 100, { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      if (info.channels !== 4) return false;
      
      let transparentPixels = 0;
      const totalPixels = info.width * info.height;
      
      // Check alpha channel (every 4th byte)
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) { // Not fully opaque
          transparentPixels++;
        }
      }
      
      const transparencyRatio = transparentPixels / totalPixels;
      return transparencyRatio > this.maxTransparency;
      
    } catch (error) {
      // If we can't analyze transparency, assume it's fine
      return false;
    }
  }

  getResolutionFolder(width, height) {
    if (width >= 3840) return '4K+';
    if (width >= 2560) return '2K/1440p';
    if (width >= 1920) return '1080p';
    if (width >= 1600) return '1600x900+';
    if (width >= 1366) return '1366x768';
    if (width >= 1280) return '720p';
    return 'Other';
  }

  async processAndSaveWallpaper(imageInfo) {
    const originalPath = imageInfo.hashPath;
    const dimensions = `${imageInfo.width}x${imageInfo.height}`;
    const newFilename = `osu_bg_${imageInfo.hashName}_${dimensions}.${imageInfo.format}`;
    const localPath = path.join(this.downloadDir, newFilename);

    try {
      // Check if already processed
      const existingWallpaper = await this.db.getWallpapers({
        provider: this.providerName,
        filename: newFilename
      });

      if (existingWallpaper.length > 0) {
        console.log(`Skipping ${newFilename} - already exists`);
        return;
      }

      console.log(`Processing background: ${newFilename} (${dimensions})`);
      
      // Copy file to downloads directory
      await fs.copyFile(originalPath, localPath);

      // Get actual file size
      const stats = await fs.stat(localPath);
      const fileSize = stats.size;

      // Get user-friendly folder name based on resolution
      const folder = this.getResolutionFolder(imageInfo.width, imageInfo.height);

      // Create wallpaper record
      const wallpaper = {
        filename: newFilename,
        provider: this.providerName,
        folder: folder,
        file_size: fileSize,
        dimensions: dimensions,
        download_url: originalPath, // Store original path as reference
        local_path: localPath,
        tags: JSON.stringify(['osu', 'background', imageInfo.format])
      };

      await this.db.insertWallpaper(wallpaper);
      console.log(`✓ Processed and saved ${newFilename}`);

    } catch (error) {
      console.error(`Error processing ${imageInfo.hashName}:`, error);
    }
  }

  async processAllBackgrounds() {
    await this.init();
    
    console.log('--- Processing Osu! Local Backgrounds ---');
    const imageFiles = await this.scanOsuFiles();
    
    console.log(`Processing ${imageFiles.length} background images...`);
    
    for (const imageInfo of imageFiles) {
      await this.processAndSaveWallpaper(imageInfo);
    }

    const stats = await this.db.getStats();
    console.log('\n--- Osu! Background Processing Complete ---');
    console.log(`Total wallpapers in database: ${stats.total}`);
    
    // Get count of osu backgrounds
    const osuCount = await this.db.getWallpapersCount({ provider: this.providerName });
    console.log(`Osu! backgrounds added: ${osuCount}`);
  }
}

if (require.main === module) {
  const osuProvider = new OsuLocalProvider();
  osuProvider.processAllBackgrounds().catch(console.error);
}

module.exports = OsuLocalProvider;