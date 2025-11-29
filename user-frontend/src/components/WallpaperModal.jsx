import { X, Download, ChevronLeft, ChevronRight, Maximize2, Share2, Minimize2 } from 'lucide-react'
import { resolveAssetUrl, API_BASE } from '../config'
import { useEffect, useRef, useState, useCallback } from 'react'

// Custom fullscreen viewer with pinch-to-zoom and mouse wheel zoom support
export function FullscreenViewer({ imageUrl, onClose }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const lastTouchRef = useRef(null)
  const lastPinchDistRef = useRef(null)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

  const resetTransform = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // Handle mouse wheel zoom (desktop)
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const zoomFactor = 0.1
    const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor
    
    setScale(prev => {
      const newScale = Math.min(Math.max(prev + delta, 1), 5)
      // Reset position if zooming back to 1
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 })
      }
      return newScale
    })
  }, [])

  // Handle mouse drag (desktop)
  const handleMouseDown = useCallback((e) => {
    if (scale > 1 && e.button === 0) {
      e.preventDefault()
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y
      }
    }
  }, [scale, position])

  const handleMouseMove = useCallback((e) => {
    if (isDragging && scale > 1) {
      e.preventDefault()
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY
      })
    }
  }, [isDragging, scale])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add/remove mouse event listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Handle pinch zoom (touch)
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
    lastTouchRef.current = e.touches
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
      // Reset position if zoomed out
      if (scale <= 1) {
        resetTransform()
      }
    }
  }, [scale, resetTransform])

  // Double-tap/double-click to zoom
  const lastTapRef = useRef(0)
  const handleDoubleTap = useCallback((e) => {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      e.preventDefault()
      if (scale > 1) {
        resetTransform()
      } else {
        setScale(2.5)
        // Center zoom on tap/click position
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

  // Keyboard escape
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
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onClick={handleDoubleTap}
      style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
    >
      <img
        ref={imageRef}
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
        {scale === 1 ? 'scroll or double-click to zoom • drag to pan' : `${Math.round(scale * 100)}% • drag to pan`}
      </div>
    </div>
  )
}

function WallpaperModal({ wallpaper, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [showFullscreen, setShowFullscreen] = useState(false)

  useEffect(() => {
    if (wallpaper) {
      document.body.style.overflow = 'hidden';
      setImageLoaded(false)
      setShareStatus('')
      setShowFullscreen(false)
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [wallpaper]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showFullscreen) return // Let fullscreen viewer handle its own keys
      if (e.key === 'ArrowLeft' && hasPrev) {
        onPrev()
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNext()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasPrev, hasNext, onPrev, onNext, onClose, showFullscreen]);

  if (!wallpaper) return null

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  const handleViewFullscreen = () => {
    setShowFullscreen(true)
  }

  const handleExitFullscreen = () => {
    setShowFullscreen(false)
  }

  const handleDownload = () => {
    // Use the server-side download proxy that sets Content-Disposition header
    const downloadUrl = `${API_BASE}/api/download/${wallpaper.id}`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = wallpaper.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?wallpaper=${wallpaper.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('copied!')
    } catch {
      setShareStatus('copy failed')
    } finally {
      setTimeout(() => setShareStatus(''), 1500)
    }
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Show custom fullscreen viewer
  if (showFullscreen) {
    return (
      <FullscreenViewer
        imageUrl={resolveAssetUrl(wallpaper.image_url)}
        onClose={handleExitFullscreen}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      {hasPrev && (
        <button className="modal-nav modal-nav-prev" onClick={onPrev} aria-label="Previous wallpaper">
          <ChevronLeft size={32} />
        </button>
      )}
      {hasNext && (
        <button className="modal-nav modal-nav-next" onClick={onNext} aria-label="Next wallpaper">
          <ChevronRight size={32} />
        </button>
      )}
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title">wallpaper preview</div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="modal-image-container">
            {!imageLoaded && <div className="modal-image-skeleton" aria-hidden="true" />}
            <img
              src={resolveAssetUrl(wallpaper.image_url)}
              alt={wallpaper.filename}
              className={`modal-image ${imageLoaded ? 'loaded' : ''}`}
              onError={(e) => {
                e.target.src = resolveAssetUrl(wallpaper.thumbnail_url)
              }}
              onLoad={() => setImageLoaded(true)}
            />
          </div>
          
          <div className="modal-sidebar">
            <div className="wallpaper-info">
              <h3>details</h3>
              <p><strong>filename:</strong> {wallpaper.filename}</p>
              <p><strong>provider:</strong> {wallpaper.provider}</p>
              {wallpaper.folder && <p><strong>category:</strong> {wallpaper.folder}</p>}
              {wallpaper.dimensions && <p><strong>resolution:</strong> {wallpaper.dimensions}</p>}
              <p><strong>file size:</strong> {formatFileSize(wallpaper.file_size)}</p>
              {wallpaper.created_at && (
                <p><strong>added:</strong> {new Date(wallpaper.created_at).toLocaleDateString()}</p>
              )}
            </div>
            
            <div className="download-section">
              <button className="download-btn" onClick={handleShare}>
                <Share2 size={16} />
                share link
              </button>
              <button className="download-btn fullscreen-btn" onClick={handleViewFullscreen}>
                <Maximize2 size={16} />
                view fullscreen
              </button>
              <button className="download-btn" onClick={handleDownload}>
                <Download size={16} />
                direct download
              </button>
              {shareStatus && <div className="share-status">{shareStatus}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WallpaperModal
