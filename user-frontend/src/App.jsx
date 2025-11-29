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

const withRetry = async (fn, attempts = 3, delayMs = 200) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
};

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

  // Lifted state for Leaderboard component to persist data between tab switches
  const [leaderboardState, setLeaderboardState] = useState({
    leaderboard: [],
    totalCount: 0,
    showBottom: false,
    loading: true,
    initialized: false
  })

  // Prefetched filter data - loaded once at app start
  const [filterData, setFilterData] = useState({
    providers: [],
    folders: [],
    resolutions: [],
    aspects: [],
    loading: true,
    hasAnimated: false  // Track if chips have animated (first load only)
  })

  // Prefetch providers, folders, and resolutions immediately on app load
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const [providersResponse, resolutionsResponse] = await Promise.all([
          withRetry(() => axios.get(`${API_BASE}/api/providers`)),
          withRetry(() => axios.get(`${API_BASE}/api/resolutions`))
        ])

        const providersData = providersResponse.data.providers || []
        const providerNames = providersData.map(p => typeof p === 'string' ? p : p.name)
        const foldersData = providersResponse.data.folders || []

        setFilterData(prev => ({
          providers: providerNames,
          folders: foldersData,
          resolutions: resolutionsResponse.data.resolutions || [],
          aspects: resolutionsResponse.data.aspects || [],
          loading: false,
          hasAnimated: prev.hasAnimated  // Preserve animation state
        }))
      } catch (err) {
        console.error('Failed to prefetch filter data:', err)
        setFilterData(prev => ({ ...prev, loading: false }))
      }
    }
    fetchFilterData()
  }, [])

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

  // Handle modal navigation across pages
  useEffect(() => {
    if (browseState._modalNavDirection && !browseState.loading && browseState.wallpapers.length > 0) {
      if (browseState._modalNavDirection === 'next') {
        // Show first wallpaper of new page
        setSelectedWallpaper(browseState.wallpapers[0])
      } else if (browseState._modalNavDirection === 'prev') {
        // Show last wallpaper of new page
        setSelectedWallpaper(browseState.wallpapers[browseState.wallpapers.length - 1])
      }
      // Clear the direction flag
      setBrowseState(prev => ({ ...prev, _modalNavDirection: null }))
    }
  }, [browseState.wallpapers, browseState.loading, browseState._modalNavDirection])

  const renderContent = () => {
    switch (activeTab) {
      case 'browse':
        return (
          <Browse 
            onWallpaperClick={setSelectedWallpaper} 
            browseState={browseState}
            setBrowseState={setBrowseState}
            filterData={filterData}
            setFilterData={setFilterData}
          />
        )
      case 'arena':
        return <Arena />
      case 'leaderboard':
        return (
          <Leaderboard 
            onNavigateToArena={() => setActiveTab('arena')}
            leaderboardState={leaderboardState}
            setLeaderboardState={setLeaderboardState}
          />
        )
      case 'random':
        return <Random />
      default:
        return (
          <Browse 
            onWallpaperClick={setSelectedWallpaper} 
            browseState={browseState}
            setBrowseState={setBrowseState}
            filterData={filterData}
            setFilterData={setFilterData}
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
            } else if (browseState.currentPage > 1) {
              // Go to previous page and show last wallpaper
              setBrowseState(prev => ({
                ...prev,
                currentPage: prev.currentPage - 1,
                loading: true,
                initialized: false,
                _modalNavDirection: 'prev'
              }))
            }
          }}
          onNext={() => {
            const currentIndex = browseState.wallpapers.findIndex(w => w.id === selectedWallpaper.id)
            if (currentIndex < browseState.wallpapers.length - 1) {
              setSelectedWallpaper(browseState.wallpapers[currentIndex + 1])
            } else if (browseState.currentPage < browseState.totalPages) {
              // Go to next page and show first wallpaper
              setBrowseState(prev => ({
                ...prev,
                currentPage: prev.currentPage + 1,
                loading: true,
                initialized: false,
                _modalNavDirection: 'next'
              }))
            }
          }}
          hasPrev={browseState.wallpapers.findIndex(w => w.id === selectedWallpaper.id) > 0 || browseState.currentPage > 1}
          hasNext={browseState.wallpapers.findIndex(w => w.id === selectedWallpaper.id) < browseState.wallpapers.length - 1 || browseState.currentPage < browseState.totalPages}
        />
      )}
    </div>
  )
}

export default App
