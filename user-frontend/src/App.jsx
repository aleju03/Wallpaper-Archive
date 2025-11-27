import { useState } from 'react'
import { Search, Images, Grid, Heart, Download, Swords, Trophy } from 'lucide-react'
import Browse from './components/Browse'
import Arena from './components/Arena'
import Leaderboard from './components/Leaderboard'
import WallpaperModal from './components/WallpaperModal'
import './App.css'

function App() {
  const [selectedWallpaper, setSelectedWallpaper] = useState(null)
  const [activeTab, setActiveTab] = useState('browse')

  const renderContent = () => {
    switch (activeTab) {
      case 'browse':
        return <Browse onWallpaperClick={setSelectedWallpaper} />
      case 'arena':
        return <Arena />
      case 'leaderboard':
        return <Leaderboard />
      default:
        return <Browse onWallpaperClick={setSelectedWallpaper} />
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>Wallpaper Archive</h1>
            <p>discover and download wallpapers</p>
          </div>
          
          <nav className="app-nav">
            <button 
              className={`nav-button ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              <Images size={16} />
              <span>browse</span>
            </button>
            <button 
              className={`nav-button ${activeTab === 'arena' ? 'active' : ''}`}
              onClick={() => setActiveTab('arena')}
            >
              <Swords size={16} />
              <span>arena</span>
            </button>
            <button 
              className={`nav-button ${activeTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('leaderboard')}
            >
              <Trophy size={16} />
              <span>leaderboard</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="main-content">
        {renderContent()}
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
