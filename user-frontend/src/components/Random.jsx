import { useState, useEffect, useCallback, useRef } from 'react'
import { Download, Shuffle, Loader, Maximize2, Minimize2 } from 'lucide-react'
import { API_BASE, resolveAssetUrl } from '../config'

// Custom fullscreen viewer with pinch-to-zoom support
function FullscreenViewer({ imageUrl, onClose }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef(null)
  const lastPinchDistRef = useRef(null)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

  const resetTransform = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      lastPinchDistRef.current = dist
    } else if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true)
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        posX: position.x,
        posY: position.y
      }
    }
  }, [scale, position])

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && lastPinchDistRef.current) {
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const delta = dist / lastPinchDistRef.current
      setScale(prev => Math.min(Math.max(prev * delta, 1), 5))
      lastPinchDistRef.current = dist
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      e.preventDefault()
      const deltaX = e.touches[0].clientX - dragStartRef.current.x
      const deltaY = e.touches[0].clientY - dragStartRef.current.y
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY
      })
    }
  }, [isDragging, scale])

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) {
      lastPinchDistRef.current = null
    }
    if (e.touches.length === 0) {
      setIsDragging(false)
      if (scale <= 1) {
        resetTransform()
      }
    }
  }, [scale, resetTransform])

  const lastTapRef = useRef(0)
  const handleDoubleTap = useCallback((e) => {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      e.preventDefault()
      if (scale > 1) {
        resetTransform()
      } else {
        setScale(2.5)
        const rect = containerRef.current.getBoundingClientRect()
        const tapX = e.changedTouches?.[0]?.clientX || e.clientX
        const tapY = e.changedTouches?.[0]?.clientY || e.clientY
        const centerX = rect.width / 2
        const centerY = rect.height / 2
        setPosition({
          x: (centerX - tapX) * 1.5,
          y: (centerY - tapY) * 1.5
        })
      }
    }
    lastTapRef.current = now
  }, [scale, resetTransform])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div 
      className="fullscreen-viewer"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleDoubleTap}
    >
      <img
        src={imageUrl}
        alt="Fullscreen view"
        className="fullscreen-viewer-image"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out'
        }}
        draggable={false}
      />
      <button className="fullscreen-exit-btn" onClick={onClose} aria-label="Exit fullscreen">
        <Minimize2 size={20} />
        <span>exit fullscreen</span>
      </button>
      {scale > 1 && (
        <button className="fullscreen-reset-btn" onClick={resetTransform} aria-label="Reset zoom">
          reset zoom
        </button>
      )}
      <div className="fullscreen-hint">
        {scale === 1 ? 'pinch or double-tap to zoom' : `${Math.round(scale * 100)}%`}
      </div>
    </div>
  )
}

function Random() {
  const [wallpaper, setWallpaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)
  const [showFullscreen, setShowFullscreen] = useState(false)

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
    // Use the server-side download proxy that sets Content-Disposition header
    const downloadUrl = `${API_BASE}/api/download/${wallpaper.id}`
    const link = document.createElement('a')
    link.href = downloadUrl
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
              
              <div className="random-action-buttons">
                <button className="random-preview-btn" onClick={() => setShowFullscreen(true)}>
                  <Maximize2 size={16} />
                  Preview
                </button>
                <button className="random-download-btn" onClick={handleDownload}>
                  <Download size={16} />
                  Download
                </button>
              </div>
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

      {showFullscreen && wallpaper && (
        <FullscreenViewer
          imageUrl={resolveAssetUrl(wallpaper.image_url)}
          onClose={() => setShowFullscreen(false)}
        />
      )}
    </div>
  )
}

export default Random
