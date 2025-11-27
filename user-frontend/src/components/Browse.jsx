import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, ChevronDown, Grid3X3, Grid2X2, AlignJustify } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

function WallpaperCard({ wallpaper, onClick, formatFileSize }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div 
      className="wallpaper-card"
      onClick={() => onClick(wallpaper)}
    >
      {!error ? (
        <img
          src={`${API_BASE}${wallpaper.thumbnail_url}`}
          alt={wallpaper.filename}
          className={`wallpaper-image ${imageLoaded ? 'loaded' : ''}`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            if (!e.target.dataset.fallbackTried) {
              e.target.dataset.fallbackTried = 'true'
              e.target.src = `${API_BASE}${wallpaper.image_url}`
              return
            }
            setError(true)
          }}
        />
      ) : (
        <div className="wallpaper-image" style={{ background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '10px', opacity: 1 }}>
          no preview
        </div>
      )}
      
      <div className="wallpaper-overlay">
        <div className="wallpaper-title">{wallpaper.filename}</div>
        <div className="wallpaper-meta">
          <span className="wallpaper-provider">{wallpaper.provider}</span>
          <span className="wallpaper-resolution">{wallpaper.dimensions || 'unknown'}</span>
          <span className="wallpaper-size">{formatFileSize(wallpaper.file_size)}</span>
        </div>
      </div>
    </div>
  )
}

function Browse({ onWallpaperClick, browseState, setBrowseState }) {
  const {
    wallpapers,
    totalCount,
    totalPages,
    currentPage,
    searchQuery,
    selectedProvider,
    selectedResolution,
    loading,
    initialized
  } = browseState

  const [providers, setProviders] = useState([])
  const [resolutions, setResolutions] = useState([])
  const [error, setError] = useState(null)
  
  const [gridColumns, setGridColumns] = useState(() => {
    // Set default based on screen size
    if (typeof window !== 'undefined') {
      if (window.innerWidth <= 360) return 2
      if (window.innerWidth <= 768) return 3
    }
    return 4
  }) // 2, 3, or 4 columns
  const itemsPerPage = 24

  // Custom dropdown state
  const [resolutionDropdownOpen, setResolutionDropdownOpen] = useState(false)
  const [resolutionSearch, setResolutionSearch] = useState('')

  const fetchProviders = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/providers`)
      const providersData = response.data.providers || []
      const providerNames = providersData.map(p => typeof p === 'string' ? p : p.name)
      setProviders(providerNames)
    } catch (err) {
      console.error('Failed to fetch providers:', err)
    }
  }

  const fetchResolutions = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/resolutions`)
      setResolutions(response.data.resolutions || [])
    } catch (err) {
      console.error('Failed to fetch resolutions:', err)
      // Fallback to empty array if API not available yet
      setResolutions([])
    }
  }

  const fetchWallpapers = useCallback(async (force = false) => {
    // If already initialized and not forced (e.g. by filter change), don't refetch
    if (initialized && !force) return

    try {
      setBrowseState(prev => ({ ...prev, loading: true }))
      const params = new URLSearchParams()
      
      if (searchQuery) params.append('search', searchQuery)
      if (selectedProvider) params.append('provider', selectedProvider)
      if (selectedResolution) params.append('resolution', selectedResolution)
      params.append('limit', itemsPerPage.toString())
      params.append('page', currentPage.toString())
      
      const response = await axios.get(`${API_BASE}/api/wallpapers?${params}`)
      
      setBrowseState(prev => ({
        ...prev,
        wallpapers: response.data.wallpapers || [],
        totalCount: response.data.total || 0,
        totalPages: Math.ceil((response.data.total || 0) / itemsPerPage),
        loading: false,
        initialized: true
      }))
      setError(null)
    } catch (err) {
      setError('Failed to load wallpapers')
      console.error('Browse error:', err)
      setBrowseState(prev => ({ ...prev, loading: false }))
    }
  }, [currentPage, itemsPerPage, searchQuery, selectedProvider, selectedResolution, initialized, setBrowseState])

  useEffect(() => {
    fetchProviders()
    fetchResolutions()
  }, [])

  useEffect(() => {
    // Initial fetch only if not initialized
    if (!initialized) {
      fetchWallpapers(true)
    }
  }, [fetchWallpapers, initialized])

  // Helper to update state and trigger fetch
  const updateFilter = (key, value) => {
    setBrowseState(prev => ({
      ...prev,
      [key]: value,
      currentPage: 1, // Reset to page 1 on filter change
      loading: true, // Show loading immediately
      initialized: false // Force refetch
    }))
  }

  const updatePage = (newPage) => {
    setBrowseState(prev => ({
      ...prev,
      currentPage: newPage,
      loading: true,
      initialized: false
    }))
  }

  // Handle responsive grid adjustments
  useEffect(() => {
    const handleResize = () => {
      // Only adjust on initial load or significant size changes, don't override user preference
      const width = window.innerWidth
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.resolution-dropdown-container')) {
        setResolutionDropdownOpen(false)
      }
    }

    if (resolutionDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [resolutionDropdownOpen])

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`
  }

  const handleWallpaperClick = (wallpaper) => {
    onWallpaperClick(wallpaper)
  }


  // Get filtered and limited resolutions for the custom dropdown
  const getFilteredResolutions = () => {
    let filtered = resolutions

    // Filter by search query
    if (resolutionSearch) {
      filtered = filtered.filter(res => 
        res.dimensions.toLowerCase().includes(resolutionSearch.toLowerCase())
      )
    }

    // If no search, show only the most popular ones (top 15)
    if (!resolutionSearch) {
      filtered = filtered.slice(0, 15)
    } else {
      // If searching, limit to top 20 results
      filtered = filtered.slice(0, 20)
    }

    return filtered
  }

  const handleResolutionSelect = (resolution) => {
    updateFilter('selectedResolution', resolution)
    setResolutionDropdownOpen(false)
    setResolutionSearch('')
  }

  const getSelectedResolutionDisplay = () => {
    if (!selectedResolution) return 'all resolutions'
    const res = resolutions.find(r => r.dimensions === selectedResolution)
    return res ? `${res.dimensions} (${res.count.toLocaleString()})` : selectedResolution
  }

  const getGridClass = () => {
    switch (gridColumns) {
      case 2: return 'wallpaper-grid-2'
      case 3: return 'wallpaper-grid-3'
      case 4: return 'wallpaper-grid-4'
      default: return 'wallpaper-grid'
    }
  }

  const getGridIcon = (columns) => {
    switch (columns) {
      case 2: return <Grid2X2 size={14} />
      case 3: return <Grid3X3 size={14} />
      case 4: return <AlignJustify size={14} />
      default: return <Grid3X3 size={14} />
    }
  }



  return (
    <div className="browse">
      <div className="browse-controls">
        <div className="search-section">
          <div className="search-bar">
            <Search className="search-icon" size={16} />
            <input
              type="text"
              placeholder="search wallpapers..."
              value={searchQuery}
              onChange={(e) => updateFilter('searchQuery', e.target.value)}
            />
          </div>
          
          <div className="filters">
            <select 
              className="filter-select"
              value={selectedProvider}
              onChange={(e) => updateFilter('selectedProvider', e.target.value)}
            >
              <option value="">all providers</option>
              {providers.map(provider => (
                <option key={provider} value={provider}>{provider.toLowerCase()}</option>
              ))}
            </select>
            
            <div className="resolution-dropdown-container">
              <button
                className="resolution-dropdown-trigger"
                onClick={() => setResolutionDropdownOpen(!resolutionDropdownOpen)}
              >
                <span>{getSelectedResolutionDisplay()}</span>
                <ChevronDown size={14} className={`dropdown-arrow ${resolutionDropdownOpen ? 'open' : ''}`} />
              </button>
              
              {resolutionDropdownOpen && (
                <div className="resolution-dropdown-menu">
                  <div className="resolution-search">
                    <Search size={14} className="search-icon" />
                    <input
                      type="text"
                      placeholder="search resolutions..."
                      value={resolutionSearch}
                      onChange={(e) => setResolutionSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  
                  <div className="resolution-options">
                    <div 
                      className={`resolution-option ${selectedResolution === '' ? 'selected' : ''}`}
                      onClick={() => handleResolutionSelect('')}
                    >
                      all resolutions
                    </div>
                    
                    {getFilteredResolutions().map(resolution => (
                      <div
                        key={resolution.dimensions}
                        className={`resolution-option ${selectedResolution === resolution.dimensions ? 'selected' : ''}`}
                        onClick={() => handleResolutionSelect(resolution.dimensions)}
                      >
                        {resolution.dimensions} ({resolution.count.toLocaleString()})
                      </div>
                    ))}
                    
                    {!resolutionSearch && (
                      <div className="resolution-option-hint">
                        type to search all {resolutions.length} resolutions...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="grid-controls">
              <button
                className={`grid-control-btn ${gridColumns === 2 ? 'active' : ''}`}
                onClick={() => setGridColumns(2)}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  setGridColumns(2)
                }}
                title="2 columns"
              >
                {getGridIcon(2)}
              </button>
              <button
                className={`grid-control-btn ${gridColumns === 3 ? 'active' : ''}`}
                onClick={() => setGridColumns(3)}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  setGridColumns(3)
                }}
                title="3 columns"  
              >
                {getGridIcon(3)}
              </button>
              <button
                className={`grid-control-btn ${gridColumns === 4 ? 'active' : ''}`}
                onClick={() => setGridColumns(4)}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  setGridColumns(4)
                }}
                title="4 columns"
              >
                {getGridIcon(4)}
              </button>
            </div>

            <div className="results-info">
              {totalCount.toLocaleString()} wallpapers found
            </div>
          </div>
        </div>
      </div>

      <div className="wallpaper-grid-container">
        
        {error && <div className="error">{error}</div>}

        {!error && (
          <div className={getGridClass()}>
            {loading ? (
              // Render 24 skeleton cards while loading
              Array.from({ length: itemsPerPage }).map((_, i) => (
                <div key={i} className="skeleton-card" />
              ))
            ) : (
              wallpapers.map((wallpaper) => (
                <WallpaperCard 
                  key={wallpaper.id}
                  wallpaper={wallpaper}
                  onClick={handleWallpaperClick}
                  formatFileSize={formatFileSize}
                />
              ))
            )}
          </div>
        )}
      </div>

      {!loading && !error && totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => updatePage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={16} />
          </button>
          
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }
            
            return (
              <button
                key={pageNum}
                onClick={() => updatePage(pageNum)}
                className={currentPage === pageNum ? 'active' : ''}
              >
                {pageNum}
              </button>
            )
          })}
          
          <button
            onClick={() => updatePage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export default Browse