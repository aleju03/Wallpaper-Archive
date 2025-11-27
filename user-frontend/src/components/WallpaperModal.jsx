import { X, Download, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import { resolveAssetUrl, API_BASE } from '../config'
import { useEffect, useState } from 'react'

function WallpaperModal({ wallpaper, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    if (wallpaper) {
      document.body.style.overflow = 'hidden';
      setImageLoaded(false)
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

  const handleViewFullscreen = () => {
    window.open(resolveAssetUrl(wallpaper.image_url), '_blank')
  }

  const handleDownload = () => {
    // Use the server-side download proxy that sets Content-Disposition header
    const downloadUrl = `${API_BASE}/api/download/${wallpaper.id}`
    window.open(downloadUrl, '_blank')
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
              <button className="download-btn fullscreen-btn" onClick={handleViewFullscreen}>
                <Maximize2 size={16} />
                view fullscreen
              </button>
              <button className="download-btn" onClick={handleDownload}>
                <Download size={16} />
                direct download
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WallpaperModal
