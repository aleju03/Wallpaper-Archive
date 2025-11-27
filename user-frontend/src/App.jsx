import { useState, useEffect } from 'react'
import { Search, Images, Grid, Heart, Download, Swords, Trophy, Shuffle, Sun, Moon } from 'lucide-react'
import { OverlayScrollbars } from 'overlayscrollbars'
import Browse from './components/Browse'
import Arena from './components/Arena'
import Leaderboard from './components/Leaderboard'
import Random from './components/Random'
import WallpaperModal from './components/WallpaperModal'
import './App.css'

function App() {
  const [selectedWallpaper, setSelectedWallpaper] = useState(null)
  const [activeTab, setActiveTab] = useState('browse')
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved || 'dark'
  })
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }
  
  useEffect(() => {
    const osInstance = OverlayScrollbars(document.body, {
      scrollbars: {
        theme: 'os-theme-custom',
        autoHide: 'leave',
        clickScroll: true,
      }
    });
    return () => osInstance.destroy();
  }, []);
  
  // Lifted state for Browse component to persist data between tab switches
  const [browseState, setBrowseState] = useState({
    wallpapers: [],
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
    pendingPage: null,
    searchQuery: '',
    selectedProvider: '',
    selectedResolution: '',
    loading: true,
    initialized: false
  })

  const renderContent = () => {
    switch (activeTab) {
      case 'browse':
        return (
          <Browse 
            onWallpaperClick={setSelectedWallpaper} 
            browseState={browseState}
            setBrowseState={setBrowseState}
          />
        )
      case 'arena':
        return <Arena />
      case 'leaderboard':
        return <Leaderboard onNavigateToArena={() => setActiveTab('arena')} />
      case 'random':
        return <Random />
      default:
        return (
          <Browse 
            onWallpaperClick={setSelectedWallpaper} 
            browseState={browseState}
            setBrowseState={setBrowseState}
          />
        )
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title" onClick={() => setActiveTab('browse')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/logo.svg" alt="Logo" style={{ height: '2em', marginRight: '0.5em' }} />
              <h1>Wallpaper Archive</h1>
            </div>
            <p>discover and download wallpapers</p>
          </div>
          
          <nav className="app-nav">
            <button 
              className="nav-button theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
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
              className={`nav-button ${activeTab === 'random' ? 'active' : ''}`}
              onClick={() => setActiveTab('random')}
            >
              <Shuffle size={16} />
              <span>random</span>
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
          onPrev={() => {
            const currentIndex = browseState.wallpapers.findIndex(w => w.id === selectedWallpaper.id)
            if (currentIndex > 0) {
              setSelectedWallpaper(browseState.wallpapers[currentIndex - 1])
            }
          }}
          onNext={() => {
            const currentIndex = browseState.wallpapers.findIndex(w => w.id === selectedWallpaper.id)
            if (currentIndex < browseState.wallpapers.length - 1) {
              setSelectedWallpaper(browseState.wallpapers[currentIndex + 1])
            }
          }}
          hasPrev={browseState.wallpapers.findIndex(w => w.id === selectedWallpaper.id) > 0}
          hasNext={browseState.wallpapers.findIndex(w => w.id === selectedWallpaper.id) < browseState.wallpapers.length - 1}
        />
      )}
    </div>
  )
}

export default App
