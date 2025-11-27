import { useState, useEffect, useCallback } from 'react'
import { Download, Shuffle, Loader } from 'lucide-react'
import { API_BASE, resolveAssetUrl } from '../config'

function Random() {
  const [wallpaper, setWallpaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)

  const fetchRandom = useCallback(async (signal, isInitial = false) => {
    setLoading(true)
    // Only show explicit image loading state if we don't have a wallpaper yet (first load)
    // For subsequent loads, we'll keep the current image visible until the new one is ready
    if (isInitial) setImageLoading(true)
    
    // Handle both direct calls (where signal might be passed) and event handlers (where event is passed)
    const fetchSignal = signal instanceof AbortSignal ? signal : undefined

    try {
      const res = await fetch(`${API_BASE}/api/wallpapers/random?t=${Date.now()}`, { signal: fetchSignal })
      const data = await res.json()
      if (data.success) {
        const newWallpaper = data.wallpaper
        
        // Preload the new image to ensure text and image update simultaneously
        if (newWallpaper.image_url) {
          try {
            const img = new Image()
            img.src = resolveAssetUrl(newWallpaper.image_url)
            await new Promise((resolve) => {
              img.onload = resolve
              img.onerror = resolve
            })
          } catch (e) {
            console.error('Preload failed', e)
          }
        }
        
        if (!fetchSignal?.aborted) {
          setWallpaper(newWallpaper)
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') return
      console.error('Failed to fetch random wallpaper:', error)
    } finally {
      if (!fetchSignal?.aborted) {
        setLoading(false)
        setImageLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchRandom(controller.signal, true)
    return () => controller.abort()
  }, [fetchRandom])

  const handleDownload = () => {
    if (!wallpaper) return
    const link = document.createElement('a')
    link.href = resolveAssetUrl(wallpaper.image_url)
    link.download = wallpaper.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  return (
    <div className="random-container">
      <div className="random-header">
        <div className="random-title">
          <Shuffle size={20} />
          <h1>Random Pick</h1>
        </div>
        
        <button 
          className="random-next-btn"
          onClick={fetchRandom} 
          disabled={loading}
        >
          <Shuffle size={14} />
          <span>Next Random</span>
        </button>
      </div>

      <div className="random-content">
        <div className="random-image-wrapper">
           {(loading || imageLoading) && (
            <div className={`random-loading-overlay ${wallpaper ? 'has-image' : ''}`}>
                <div style={{ animation: 'spin 1s linear infinite' }}>
                    <Loader size={32} />
                </div>
            </div>
           )}
           {wallpaper && (
             <img
              src={resolveAssetUrl(wallpaper.image_url)}
              alt={wallpaper.filename}
              className={`random-image ${imageLoading ? 'loading' : ''}`}
              onLoad={() => setImageLoading(false)}
              onError={(e) => {
                  e.target.src = resolveAssetUrl(wallpaper.thumbnail_url)
                  setImageLoading(false)
              }}
             />
           )}
        </div>
        
        <div className="random-info">
          {wallpaper ? (
            <div className="random-info-content">
              <div className="random-info-details">
                <h2 className="random-filename">{wallpaper.filename}</h2>
                <div className="random-meta">
                  <span>{wallpaper.provider}</span>
                  {wallpaper.dimensions && <span>{wallpaper.dimensions}</span>}
                  <span>{formatFileSize(wallpaper.file_size)}</span>
                </div>
              </div>
              
              <button className="random-download-btn" onClick={handleDownload}>
                <Download size={16} />
                Download
              </button>
            </div>
          ) : (
            <div className="random-skeleton-container">
              <div className="random-skeleton-details">
                <div className="skeleton-loader random-skeleton-title" />
                <div className="random-skeleton-meta">
                  <div className="skeleton-loader random-skeleton-meta-item" style={{ width: '80px' }} />
                  <div className="skeleton-loader random-skeleton-meta-item" style={{ width: '60px' }} />
                  <div className="skeleton-loader random-skeleton-meta-item" style={{ width: '70px' }} />
                </div>
              </div>
              <div className="skeleton-loader random-skeleton-button" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Random
