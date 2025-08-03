import { useState } from 'react'
import { Search, Images, Grid, Heart, Download } from 'lucide-react'
import Browse from './components/Browse'
import WallpaperModal from './components/WallpaperModal'
import './App.css'

function App() {
  const [selectedWallpaper, setSelectedWallpaper] = useState(null)

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>Wallpaper Engine</h1>
            <p>discover and download wallpapers</p>
          </div>
        </div>
      </header>

      <main className="main-content">
        <Browse onWallpaperClick={setSelectedWallpaper} />
      </main>

      {selectedWallpaper && (
        <WallpaperModal 
          wallpaper={selectedWallpaper} 
          onClose={() => setSelectedWallpaper(null)} 
        />
      )}
    </div>
  )
}

export default App
