import { useState, useEffect } from 'react'
import { Search, Images, Grid, Heart, Download, Swords, Trophy, Shuffle, Sun, Moon } from 'lucide-react'
import { OverlayScrollbars } from 'overlayscrollbars'
import axios from 'axios'
import Browse from './components/Browse'
import Arena from './components/Arena'
import Leaderboard from './components/Leaderboard'
import Random from './components/Random'
import WallpaperModal from './components/WallpaperModal'
import { API_BASE } from './config'
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
  
  const toggleTheme = (event) => {
    if (!document.startViewTransition) {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark')
      return
    }

    const x = event.clientX
    const y = event.clientY

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    const transition = document.startViewTransition(() => {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark')
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`
      ]

      document.documentElement.animate(
        {
          clipPath: clipPath
        },
        {
          duration: 500,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        }
      )
    })
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
    selectedFolders: [],
    selectedResolution: '',
    selectedAspect: '',
    loading: true,
    initialized: false
  })

  // Deep link support: open a wallpaper by id from the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wallpaperId = params.get('wallpaper')
    if (wallpaperId) {
      axios.get(`${API_BASE}/api/wallpapers/${wallpaperId}`)
        .then((response) => {
          if (response.data?.wallpaper) {
            setSelectedWallpaper({
              ...response.data.wallpaper,
              image_url: response.data.wallpaper.download_url
            })
          }
        })
        .catch(() => {
          // Ignore failures; user can still browse normally
        })
    }
  }, [])

  // Keep the shareable link in sync with the currently open wallpaper
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (selectedWallpaper?.id) {
      params.set('wallpaper', selectedWallpaper.id)
    } else {
      params.delete('wallpaper')
    }
    const query = params.toString()
    const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [selectedWallpaper])

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
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <svg className="site-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 17L10 7L15 17" />
                <path d="M9 17L14 7L19 17" />
              </svg>
              <h1>Wallpaper Archive</h1>
            </div>
            <p>discover and download wallpapers</p>
          </div>
          
          <div className="header-actions">
            <button 
              className="nav-button theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            
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
