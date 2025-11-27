const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const Database = require('./database');
const OsuLocalProvider = require('./osu-provider');
require('dotenv').config();

class WallpaperDownloader {
  constructor() {
    this.db = new Database();
    this.downloadDir = './downloads';
    this.thumbnailDir = './thumbnails';
    this.token = process.env.GITHUB_TOKEN;
    
    this.providers = [
      {
        name: 'BitterSweetcandyshop',
        api: 'https://api.github.com/repos/BitterSweetcandyshop/wallpapers/contents',
        rawUrl: 'https://raw.githubusercontent.com/BitterSweetcandyshop/wallpapers/main',
        folders: ['cat', 'favs', 'personal', 'unix_sorted', 'unixporn_wallpapers']
      },
      {
        name: 'D3Ext Aesthetic',
        api: 'https://api.github.com/repos/D3Ext/aesthetic-wallpapers/contents',
        rawUrl: 'https://raw.githubusercontent.com/D3Ext/aesthetic-wallpapers/main',
        folders: ['images']
      },
      {
        name: 'dharmx Themed',
        api: 'https://api.github.com/repos/dharmx/walls/contents',
        rawUrl: 'https://raw.githubusercontent.com/dharmx/walls/main',
        folders: []
      },
      {
        name: 'MichaelScopic Collection',
        api: 'https://api.github.com/repos/michaelScopic/Wallpapers/contents',
        rawUrl: 'https://raw.githubusercontent.com/michaelScopic/Wallpapers/main',
        folders: ['abstract', 'animated', 'anime', 'cars', 'catppuccin', 'cyberpunk', 'decay', 'gruvbox', 'japanese', 'linux', 'misc', 'monochrome', 'nature', 'nord', 'one-dark', 'other-themes', 'pastel', 'purple', 'space', 'tokyo-night', 'windows']
      },
      {
        name: 'LpCodes Collection',
        api: 'https://api.github.com/repos/LpCodes/wallpaper/contents',
        rawUrl: 'https://raw.githubusercontent.com/LpCodes/wallpaper/main',
        folders: ['']
      },
      {
        name: 'Dixiedream Wallpapers',
        api: 'https://api.github.com/repos/dixiedream/wallpapers/contents',
        rawUrl: 'https://raw.githubusercontent.com/dixiedream/wallpapers/main',
        folders: ['1080p']
      }
    ];
  }

  async init() {
    await fs.mkdir(this.downloadDir, { recursive: true });
    await fs.mkdir(this.thumbnailDir, { recursive: true });
  }

  async fetchGitHubAPI(url) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.token}`,
        'User-Agent': 'WallpaperEngine'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async discoverFolders(provider) {
    if (provider.folders.length > 0) {
      return provider.folders;
    }

    try {
      const contents = await this.fetchGitHubAPI(provider.api);
      return contents
        .filter(item => item.type === 'dir')
        .map(item => item.name);
    } catch (error) {
      console.error(`Error discovering folders for ${provider.name}:`, error);
      return [];
    }
  }

  async downloadWallpapersFromFolder(provider, folder) {
    const folderUrl = folder ? `${provider.api}/${folder}` : provider.api;
    
    try {
      console.log(`Fetching wallpapers from ${provider.name}/${folder || 'root'}...`);
      const contents = await this.fetchGitHubAPI(folderUrl);
      
      const imageFiles = contents.filter(item => 
        item.type === 'file' && 
        /\.(jpg|jpeg|png|webp|gif)$/i.test(item.name)
      );

      console.log(`Found ${imageFiles.length} images in ${provider.name}/${folder || 'root'}`);

      for (const file of imageFiles) {
        await this.downloadAndSaveWallpaper(provider, folder, file);
      }

    } catch (error) {
      console.error(`Error downloading from ${provider.name}/${folder}:`, error);
    }
  }

  async downloadAndSaveWallpaper(provider, folder, file) {
    const downloadUrl = file.download_url;
    const localPath = path.join(this.downloadDir, `${provider.name}_${folder || 'root'}_${file.name}`);

    try {
      const existingWallpaper = await this.db.getWallpapers({
        provider: provider.name,
        folder: folder || null,
        filename: file.name
      });

      if (existingWallpaper.length > 0) {
        console.log(`Skipping ${file.name} - already exists`);
        return;
      }

      console.log(`Downloading ${file.name}...`);
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const bufferUint8 = new Uint8Array(buffer);
      await fs.writeFile(localPath, bufferUint8);

      let dimensions = null;
      try {
        const metadata = await sharp(localPath).metadata();
        dimensions = `${metadata.width}x${metadata.height}`;
      } catch (error) {
        console.warn(`Could not extract dimensions for ${file.name}:`, error.message);
      }

      const wallpaper = {
        filename: file.name,
        provider: provider.name,
        folder: folder || null,
        file_size: file.size,
        dimensions: dimensions,
        download_url: downloadUrl,
        local_path: localPath,
        tags: folder ? `[\"${folder}\"]` : null
      };

      await this.db.insertWallpaper(wallpaper);
      console.log(` Downloaded and saved ${file.name}`);

    } catch (error) {
      console.error(`Error downloading ${file.name}:`, error);
    }
  }

  async downloadAll() {
    await this.init();
    
    console.log('Starting wallpaper download from all providers...');
    
    // Process GitHub providers
    for (const provider of this.providers) {
      console.log(`\n--- Processing provider: ${provider.name} ---`);
      
      const folders = await this.discoverFolders(provider);
      
      if (folders.length === 0) {
        await this.downloadWallpapersFromFolder(provider, '');
      } else {
        for (const folder of folders) {
          await this.downloadWallpapersFromFolder(provider, folder);
        }
      }
    }

    // Process Osu! (lazer) local backgrounds (optional)
    if (process.env.OSU_FILES_PATH) {
      console.log('\n--- Processing Osu! Local Backgrounds ---');
      const osuProvider = new OsuLocalProvider();
      await osuProvider.processAllBackgrounds();
    }

    const stats = await this.db.getStats();
    console.log('\n--- Download Complete ---');
    console.log(`Total wallpapers: ${stats.total}`);
    console.log(`Providers: ${stats.providers}`);
    console.log(`Folders: ${stats.folders}`);
  }

  async downloadOsuOnly() {
    await this.init();
    
    console.log('Processing Osu! Local Backgrounds only...');
    const osuProvider = new OsuLocalProvider();
    await osuProvider.processAllBackgrounds();
  }
}

if (require.main === module) {
  const downloader = new WallpaperDownloader();
  downloader.downloadAll().catch(console.error);
}

module.exports = WallpaperDownloader;