import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

function Browse({ onWallpaperClick }) {
  const [wallpapers, setWallpapers] = useState([])
  const [providers, setProviders] = useState([])
  const [resolutions, setResolutions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedResolution, setSelectedResolution] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
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

  const fetchWallpapers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (searchQuery) params.append('search', searchQuery)
      if (selectedProvider) params.append('provider', selectedProvider)
      if (selectedResolution) params.append('resolution', selectedResolution)
      params.append('limit', itemsPerPage.toString())
      params.append('page', currentPage.toString())
      
      const response = await axios.get(`${API_BASE}/api/wallpapers?${params}`)
      setWallpapers(response.data.wallpapers || [])
      setTotalCount(response.data.total || 0)
      setTotalPages(Math.ceil((response.data.total || 0) / itemsPerPage))
      setError(null)
    } catch (err) {
      setError('Failed to load wallpapers')
      console.error('Browse error:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, itemsPerPage, searchQuery, selectedProvider, selectedResolution])

  useEffect(() => {
    fetchProviders()
    fetchResolutions()
    fetchWallpapers()
  }, [fetchWallpapers])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedProvider, selectedResolution])

  useEffect(() => {
    fetchWallpapers()
  }, [currentPage, searchQuery, selectedProvider, selectedResolution, fetchWallpapers])

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
    setSelectedResolution(resolution)
    setResolutionDropdownOpen(false)
    setResolutionSearch('')
  }

  const getSelectedResolutionDisplay = () => {
    if (!selectedResolution) return 'all resolutions'
    const res = resolutions.find(r => r.dimensions === selectedResolution)
    return res ? `${res.dimensions} (${res.count.toLocaleString()})` : selectedResolution
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
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="filters">
            <select 
              className="filter-select"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
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
            
            <div className="results-info">
              {totalCount.toLocaleString()} wallpapers found
            </div>
          </div>
        </div>
      </div>

      <div className="wallpaper-grid-container">
        {loading && <div className="loading">loading wallpapers...</div>}
        
        {error && <div className="error">{error}</div>}

        {!loading && !error && (
          <div className="wallpaper-grid">
            {wallpapers.map((wallpaper) => (
              <div 
                key={wallpaper.id} 
                className="wallpaper-card"
                onClick={() => handleWallpaperClick(wallpaper)}
              >
                <img
                  src={`${API_BASE}${wallpaper.thumbnail_url}`}
                  alt={wallpaper.filename}
                  className="wallpaper-image"
                  loading="lazy"
                  onError={(e) => {
                    if (!e.target.dataset.fallbackTried) {
                      e.target.dataset.fallbackTried = 'true'
                      e.target.src = `${API_BASE}${wallpaper.image_url}`
                      return
                    }
                    e.target.style.display = 'none'
                    e.target.parentNode.innerHTML += '<div class="wallpaper-image" style="background: #111; display: flex; align-items: center; justify-content: center; color: #666; font-size: 10px;">no preview</div>'
                  }}
                />
                
                <div className="wallpaper-overlay">
                  <div className="wallpaper-title">{wallpaper.filename}</div>
                  <div className="wallpaper-meta">
                    <span className="wallpaper-provider">{wallpaper.provider}</span>
                    <span className="wallpaper-resolution">{wallpaper.dimensions || 'unknown'}</span>
                    <span className="wallpaper-size">{formatFileSize(wallpaper.file_size)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && !error && totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                onClick={() => setCurrentPage(pageNum)}
                className={currentPage === pageNum ? 'active' : ''}
              >
                {pageNum}
              </button>
            )
          })}
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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