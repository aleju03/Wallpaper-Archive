import { useEffect, useState } from 'react'
import axios from 'axios'
import { Trash2, X, Download, Maximize2, Minimize2 } from 'lucide-react'
import { useAdminData } from '../context/useAdminData'
import { API_BASE } from '../config'

const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY || ''

function StatCardSkeleton() {
  return (
    <div className="stat-card stat-card--skeleton">
      <h3 className="skeleton-text skeleton-text--sm">&nbsp;</h3>
      <div className="value skeleton-text skeleton-text--lg">&nbsp;</div>
      <div className="change skeleton-text skeleton-text--xs">&nbsp;</div>
    </div>
  )
}

function ProviderChipSkeleton() {
  return (
    <div className="provider-chip provider-chip--skeleton">
      <span className="provider-chip__status skeleton-circle" />
      <span className="provider-chip__name skeleton-text">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      <span className="provider-chip__count skeleton-text">&nbsp;&nbsp;</span>
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes.toFixed(1)} ${units[i]}`
}

function FullscreenViewer({ imageUrl, onClose }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = { x: 0, y: 0, posX: 0, posY: 0 }

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(prev => {
      const newScale = Math.min(Math.max(prev + delta, 1), 5)
      if (newScale <= 1) setPosition({ x: 0, y: 0 })
      return newScale
    })
  }

  const handleMouseDown = (e) => {
    if (scale > 1 && e.button === 0) {
      e.preventDefault()
      setIsDragging(true)
      dragStartRef.x = e.clientX
      dragStartRef.y = e.clientY
      dragStartRef.posX = position.x
      dragStartRef.posY = position.y
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: dragStartRef.posX + (e.clientX - dragStartRef.x),
        y: dragStartRef.posY + (e.clientY - dragStartRef.y)
      })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    } else {
      setScale(2.5)
    }
  }

  return (
    <div 
      className="fullscreen-viewer"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
    >
      <img
        src={imageUrl}
        alt="Fullscreen view"
        className="fullscreen-viewer__image"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out'
        }}
        draggable={false}
      />
      <button className="fullscreen-viewer__exit" onClick={onClose}>
        <Minimize2 size={16} />
        <span>exit fullscreen</span>
      </button>
      {scale > 1 && (
        <button className="fullscreen-viewer__reset" onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }) }}>
          reset zoom
        </button>
      )}
      <div className="fullscreen-viewer__hint">
        {scale === 1 ? 'scroll or double-click to zoom' : `${Math.round(scale * 100)}% · drag to pan`}
      </div>
    </div>
  )
}

function ImagePreviewModal({ wallpaper, onClose, onDelete }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showFullscreen, setShowFullscreen] = useState(false)

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && !showFullscreen) onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleEsc)
    }
  }, [onClose, showFullscreen])

  if (!wallpaper) return null

  if (showFullscreen) {
    return <FullscreenViewer imageUrl={wallpaper.image_url} onClose={() => setShowFullscreen(false)} />
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = `${API_BASE}/api/download/${wallpaper.id}`
    link.download = wallpaper.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="preview-modal-overlay" onClick={handleOverlayClick}>
      <div className="preview-modal">
        <div className="preview-modal__header">
          <span className="preview-modal__title">wallpaper preview</span>
          <button className="preview-modal__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        
        <div className="preview-modal__body">
          <div className="preview-modal__image-container">
            {!imageLoaded && <div className="preview-modal__skeleton" />}
            <img
              src={wallpaper.image_url}
              alt={wallpaper.filename}
              className={`preview-modal__image ${imageLoaded ? 'loaded' : ''}`}
              onLoad={() => setImageLoaded(true)}
              onError={(e) => { e.target.src = wallpaper.thumbnail_url }}
            />
          </div>
          
          <div className="preview-modal__sidebar">
            <div className="preview-modal__details">
              <h4>details</h4>
              <p><strong>filename:</strong> {wallpaper.filename}</p>
              <p><strong>provider:</strong> {wallpaper.provider}</p>
              {wallpaper.folder && <p><strong>category:</strong> {wallpaper.folder}</p>}
              {wallpaper.dimensions && <p><strong>resolution:</strong> {wallpaper.dimensions}</p>}
              <p><strong>file size:</strong> {formatFileSize(wallpaper.file_size)}</p>
            </div>
            
            <div className="preview-modal__actions">
              <button className="preview-modal__btn" onClick={() => setShowFullscreen(true)}>
                <Maximize2 size={14} />
                view fullscreen
              </button>
              <button className="preview-modal__btn" onClick={handleDownload}>
                <Download size={14} />
                download
              </button>
              <button className="preview-modal__btn preview-modal__btn--danger" onClick={() => onDelete(wallpaper.id, wallpaper.filename)}>
                <Trash2 size={14} />
                delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Dashboard() {
  const { stats, fetchStats, providerMeta, fetchProviders, statsLoading, providersLoading, errors } = useAdminData()
  const [largestWallpapers, setLargestWallpapers] = useState([])
  const [largestLoading, setLargestLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [previewWallpaper, setPreviewWallpaper] = useState(null)

  useEffect(() => {
    fetchStats()
    fetchProviders()
    fetchLargestWallpapers()
  }, [fetchStats, fetchProviders])

  const fetchLargestWallpapers = async () => {
    setLargestLoading(true)
    try {
      const response = await axios.get(`${API_BASE}/api/wallpapers/largest?limit=10`)
      setLargestWallpapers(response.data.wallpapers || [])
    } catch (error) {
      console.error('Failed to fetch largest wallpapers:', error)
    } finally {
      setLargestLoading(false)
    }
  }

  const handleDelete = async (id, filename) => {
    if (!confirm(`Delete "${filename}"? This will remove it from both database AND storage.`)) return
    
    setDeleting(id)
    try {
      await axios.delete(`${API_BASE}/api/wallpapers/${id}?deleteFile=true`, {
        headers: { 'X-Admin-Key': ADMIN_API_KEY }
      })
      setLargestWallpapers(prev => prev.filter(w => w.id !== id))
      fetchStats(true) // Refresh stats after delete
    } catch (error) {
      alert('Failed to delete: ' + (error.response?.data?.error || error.message))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div className="stats-grid">
          {statsLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : errors.stats ? (
            <div className="stat-card stat-card--error">
              <p>{errors.stats}</p>
            </div>
          ) : (
            <>
              <div className="stat-card">
                <h3>Total Wallpapers</h3>
                <div className="value">{stats?.total_wallpapers?.toLocaleString() || '0'}</div>
                <div className="change">Across all providers</div>
              </div>
              
              <div className="stat-card">
                <h3>Providers</h3>
                <div className="value">{stats?.providers || '0'}</div>
                <div className="change">Active sources</div>
              </div>
              
              <div className="stat-card">
                <h3>Categories</h3>
                <div className="value">{stats?.folders || '0'}</div>
                <div className="change">Different folders</div>
              </div>

              <div className="stat-card">
                <h3>Storage Size</h3>
                <div className="value">{((stats?.storage_size || 0) / (1000 * 1000 * 1000)).toFixed(2)}GB</div>
                <div className="change">R2 bucket total</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="provider-status-section">
        <h3>Providers</h3>
        <div className="provider-list">
          {providersLoading ? (
            <>
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
            </>
          ) : errors.providers ? (
            <span className="error-text">{errors.providers}</span>
          ) : (
            providerMeta.map((provider, index) => (
              <div key={index} className="provider-chip">
                <span className={`provider-chip__status provider-chip__status--${provider.status}`} />
                <span className="provider-chip__name">{provider.name}</span>
                <span className="provider-chip__count">{provider.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Largest Wallpapers Section */}
      <div className="largest-section">
        <h3>Largest Files</h3>
        <span className="largest-section__hint">Delete to free up storage</span>
        <div className="largest-list">
          {largestLoading ? (
            <div className="largest-list__loading">Loading...</div>
          ) : largestWallpapers.length === 0 ? (
            <div className="largest-list__empty">No wallpapers found</div>
          ) : (
            largestWallpapers.map((wallpaper) => (
              <div key={wallpaper.id} className="largest-item">
                <img 
                  src={wallpaper.thumbnail_url} 
                  alt={wallpaper.filename}
                  className="largest-item__thumb"
                  loading="lazy"
                  onClick={() => setPreviewWallpaper(wallpaper)}
                />
                <div className="largest-item__info">
                  <span className="largest-item__name" title={wallpaper.filename}>
                    {wallpaper.filename}
                  </span>
                  <span className="largest-item__meta">
                    {wallpaper.dimensions} · {wallpaper.provider}
                  </span>
                </div>
                <span className="largest-item__size">
                  {formatFileSize(wallpaper.file_size)}
                </span>
                <button 
                  className="largest-item__delete"
                  onClick={() => handleDelete(wallpaper.id, wallpaper.filename)}
                  disabled={deleting === wallpaper.id}
                  title="Delete wallpaper"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewWallpaper && (
        <ImagePreviewModal 
          wallpaper={previewWallpaper} 
          onClose={() => setPreviewWallpaper(null)}
          onDelete={(id, filename) => {
            setPreviewWallpaper(null)
            handleDelete(id, filename)
          }}
        />
      )}
    </div>
  )
}

export default Dashboard
