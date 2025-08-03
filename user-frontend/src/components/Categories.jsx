import { useState, useEffect } from 'react'
import { Folder, Image } from 'lucide-react'
import axios from 'axios'

const API_BASE = 'http://localhost:3000'

function Categories({ onWallpaperClick }) {
  const [providers, setProviders] = useState([])
  const [folders, setFolders] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryWallpapers, setCategoryWallpapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_BASE}/api/providers`)
      const providersData = response.data.providers || []
      const providerNames = providersData.map(p => typeof p === 'string' ? p : p.name)
      setProviders(providerNames)
      setFolders(response.data.folders || [])
      setError(null)
    } catch (err) {
      setError('Failed to load categories')
      console.error('Categories error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategoryWallpapers = async (type, value) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append(type, value)
      params.append('limit', '12')
      
      const response = await axios.get(`${API_BASE}/api/wallpapers?${params}`)
      setCategoryWallpapers(response.data.wallpapers || [])
      setSelectedCategory({ type, value, count: response.data.total || 0 })
      setError(null)
    } catch (err) {
      setError('Failed to load wallpapers')
      console.error('Category wallpapers error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryClick = (type, value) => {
    fetchCategoryWallpapers(type, value)
  }

  const handleBack = () => {
    setSelectedCategory(null)
    setCategoryWallpapers([])
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`
  }

  if (loading && !selectedCategory) {
    return <div className="loading">loading categories...</div>
  }

  if (error && !selectedCategory) {
    return <div className="error">{error}</div>
  }

  if (selectedCategory) {
    return (
      <div className="browse">
        <div className="browse-controls">
          <div className="search-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <button 
                onClick={handleBack}
                style={{
                  background: 'none',
                  border: '1px solid #333333',
                  color: '#ffffff',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontFamily: 'inherit'
                }}
              >
                ← back
              </button>
              <div>
                <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
                  {selectedCategory.value}
                </h2>
                <p style={{ fontSize: '11px', color: '#666666' }}>
                  {selectedCategory.count.toLocaleString()} wallpapers
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="wallpaper-grid-container">
          {loading && <div className="loading">loading wallpapers...</div>}
          
          {error && <div className="error">{error}</div>}

          {!loading && !error && (
            <div className="wallpaper-grid">
              {categoryWallpapers.map((wallpaper) => (
                <div 
                  key={wallpaper.id} 
                  className="wallpaper-card"
                  onClick={() => onWallpaperClick(wallpaper)}
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
      </div>
    )
  }

  return (
    <div className="browse">
      <div className="browse-controls">
        <div className="search-section">
          <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
            browse by category
          </h2>
        </div>
      </div>

      <div className="wallpaper-grid-container">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ 
              fontSize: '12px', 
              color: '#888888', 
              textTransform: 'uppercase', 
              letterSpacing: '1px', 
              marginBottom: '16px' 
            }}>
              providers
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
              gap: '12px' 
            }}>
              {providers.map((provider) => (
                <div
                  key={provider}
                  onClick={() => handleCategoryClick('provider', provider)}
                  style={{
                    background: '#000000',
                    border: '1px solid #333333',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#ffffff'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#333333'
                  }}
                >
                  <Folder size={16} color="#666666" />
                  <span style={{ fontSize: '12px', color: '#ffffff' }}>
                    {provider.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ 
              fontSize: '12px', 
              color: '#888888', 
              textTransform: 'uppercase', 
              letterSpacing: '1px', 
              marginBottom: '16px' 
            }}>
              collections
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
              gap: '12px' 
            }}>
              {folders.map((folder) => (
                <div
                  key={folder}
                  onClick={() => handleCategoryClick('folder', folder)}
                  style={{
                    background: '#000000',
                    border: '1px solid #333333',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#ffffff'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#333333'
                  }}
                >
                  <Image size={16} color="#666666" />
                  <span style={{ fontSize: '12px', color: '#ffffff' }}>
                    {folder.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Categories