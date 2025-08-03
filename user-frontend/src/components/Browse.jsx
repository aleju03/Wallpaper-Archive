import { useState, useEffect } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import axios from 'axios'

const API_BASE = 'http://localhost:3000'

function Browse({ onWallpaperClick }) {
  const [wallpapers, setWallpapers] = useState([])
  const [providers, setProviders] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 24

  useEffect(() => {
    fetchProviders()
    fetchWallpapers()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedProvider, selectedFolder])

  useEffect(() => {
    fetchWallpapers()
  }, [currentPage, searchQuery, selectedProvider, selectedFolder])

  const fetchProviders = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/providers`)
      const providersData = response.data.providers || []
      const providerNames = providersData.map(p => typeof p === 'string' ? p : p.name)
      setProviders(providerNames)
      setFolders(response.data.folders || [])
    } catch (err) {
      console.error('Failed to fetch providers:', err)
    }
  }

  const fetchWallpapers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (searchQuery) params.append('search', searchQuery)
      if (selectedProvider) params.append('provider', selectedProvider)
      if (selectedFolder) params.append('folder', selectedFolder)
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
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`
  }

  const handleWallpaperClick = (wallpaper) => {
    onWallpaperClick(wallpaper)
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