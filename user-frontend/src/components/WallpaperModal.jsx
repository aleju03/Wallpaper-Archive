import { X, Download, ChevronLeft, ChevronRight, Maximize2, Share2, Minimize2 } from 'lucide-react'
import { resolveAssetUrl, API_BASE } from '../config'
import { useEffect, useRef, useState } from 'react'

function WallpaperModal({ wallpaper, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const imageContainerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (wallpaper) {
      document.body.style.overflow = 'hidden';
      setImageLoaded(false)
      setShareStatus('')
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [wallpaper]);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
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
  }, [hasPrev, hasNext, onPrev, onNext, onClose]);

  if (!wallpaper) return null

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  const handleViewFullscreen = async () => {
    if (imageContainerRef.current && imageContainerRef.current.requestFullscreen) {
      try {
        await imageContainerRef.current.requestFullscreen()
      } catch {
        window.open(resolveAssetUrl(wallpaper.image_url), '_blank')
      }
    } else {
      window.open(resolveAssetUrl(wallpaper.image_url), '_blank')
    }
  }

  const handleDownload = () => {
    // Use the server-side download proxy that sets Content-Disposition header
    const downloadUrl = `${API_BASE}/api/download/${wallpaper.id}`
    window.open(downloadUrl, '_blank')
  }

  const handleExitFullscreen = async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen()
      } catch (error) {
        // no-op
      }
    }
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?wallpaper=${wallpaper.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('copied!')
    } catch (error) {
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
          {isFullscreen && (
            <button className="modal-action" onClick={handleExitFullscreen}>
              <Minimize2 size={14} />
              exit fullscreen
            </button>
          )}
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="modal-image-container" ref={imageContainerRef}>
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
