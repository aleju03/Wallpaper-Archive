import { X, Download } from 'lucide-react'
import { resolveAssetUrl } from '../config'
import { useEffect } from 'react'

function WallpaperModal({ wallpaper, onClose }) {
  useEffect(() => {
    if (wallpaper) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [wallpaper]);

  if (!wallpaper) return null

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = resolveAssetUrl(wallpaper.image_url)
    link.download = wallpaper.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title">wallpaper preview</div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="modal-image-container">
            <img
              src={resolveAssetUrl(wallpaper.image_url)}
              alt={wallpaper.filename}
              className="modal-image"
              onError={(e) => {
                e.target.src = resolveAssetUrl(wallpaper.thumbnail_url)
              }}
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
              <button className="download-btn" onClick={handleDownload}>
                <Download size={16} />
                download
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WallpaperModal
