import { useState, useEffect } from 'react'
import { Search, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import axios from 'axios'
import { API_BASE, resolveAssetUrl, getAdminHeaders } from '../config'
import { useAdminData } from '../context/useAdminData'

function Gallery() {
  const [wallpapers, setWallpapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { providers, folders, fetchProviders } = useAdminData()
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 20
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, wallpaper: null })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, confirmText: 'Delete', isDangerous: true })
  const [statusMessage, setStatusMessage] = useState(null)

  useEffect(() => {
    fetchProviders()
    fetchWallpapers()
    
    // Add click listener to close context menu
    const handleClickOutside = () => setContextMenu({ show: false, x: 0, y: 0, wallpaper: null })
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!statusMessage) return
    const timer = setTimeout(() => setStatusMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [statusMessage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedProvider, selectedFolder])

  useEffect(() => {
    fetchWallpapers()
  }, [currentPage, searchQuery, selectedProvider, selectedFolder])

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
      console.error('Gallery error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Server-side pagination - wallpapers are already paginated

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`
  }

  const getTags = (wallpaper) => {
    const tags = []
    if (wallpaper.folder) tags.push(wallpaper.folder)
    if (wallpaper.dimensions) tags.push(wallpaper.dimensions)
    return tags
  }

  const showConfirmModal = (title, message, onConfirm, confirmText = 'Delete', isDangerous = true) => {
    setConfirmModal({ show: true, title, message, onConfirm, confirmText, isDangerous })
  }

  const hideConfirmModal = () => {
    setConfirmModal({ show: false, title: '', message: '', onConfirm: null, confirmText: 'Delete', isDangerous: true })
  }

  const deleteWallpaper = async (wallpaper, deleteFile = true) => {
    const action = deleteFile ? 'delete the file and database entry' : 'delete from database'
    const title = deleteFile ? 'Delete File & Database Entry' : 'Delete from Database'
    
    showConfirmModal(
      title,
      `Are you sure you want to ${action} for "${wallpaper.filename}"? This action cannot be undone.`,
      async () => {
        try {
          const url = `${API_BASE}/api/wallpapers/${wallpaper.id}${deleteFile ? '?deleteFile=true' : ''}`
          const response = await axios.delete(url, { headers: getAdminHeaders() })
          
          if (response.data.success) {
            // Refresh the wallpapers list
            fetchWallpapers()
            setStatusMessage({ type: 'success', text: `Deleted ${wallpaper.filename}` })
          } else {
            console.error('Failed to delete wallpaper:', response.data.error)
            setStatusMessage({ type: 'error', text: response.data.error || 'Deletion failed' })
          }
        } catch (err) {
          console.error('Error deleting wallpaper:', err.message)
          setStatusMessage({ type: 'error', text: 'Deletion failed. Check console for details.' })
        }
        hideConfirmModal()
      }
    )
  }

  const handleRightClick = (e, wallpaper) => {
    e.preventDefault()
    setContextMenu({
      show: true,
      x: e.pageX,
      y: e.pageY,
      wallpaper
    })
  }

  return (
    <div className="gallery">
      <div className="gallery-controls">
        <div className="search-filters">
          <div className="search-box">
            <Search className="search-icon" size={16} />
            <input
              type="text"
              placeholder="Search wallpapers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <select 
            className="filter-select"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option value="">All Providers</option>
            {providers.map(provider => (
              <option key={provider} value={provider}>{provider}</option>
            ))}
          </select>
          
          <select 
            className="filter-select"
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
          >
            <option value="">All Folders</option>
            {folders.map(folder => (
              <option key={folder} value={folder}>{folder}</option>
            ))}
          </select>
          
          <div className="gallery-count">
            {totalCount} wallpapers found
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className={`status-toast ${statusMessage.type === 'success' ? 'status-toast--success' : 'status-toast--error'}`}>
          {statusMessage.text}
        </div>
      )}

      {loading && <div className="loading">Loading wallpapers...</div>}
      
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="wallpaper-grid">
            {wallpapers.map((wallpaper) => (
              <div 
                key={wallpaper.id} 
                className="wallpaper-card"
                onContextMenu={(e) => handleRightClick(e, wallpaper)}
              >
                <img
                  src={resolveAssetUrl(wallpaper.thumbnail_url)}
                  alt={wallpaper.filename}
                  className="wallpaper-image"
                  loading="lazy"
                  onLoad={(e) => {
                    // Remove any existing placeholder when image loads successfully
                    const placeholder = e.target.parentNode.querySelector('.wallpaper-image-placeholder')
                    if (placeholder) {
                      placeholder.remove()
                    }
                  }}
                  onError={(e) => {
                    console.log(`Failed to load thumbnail: ${wallpaper.thumbnail_url}`)
                    // Try the original image as fallback first
                    if (!e.target.dataset.fallbackTried) {
                      e.target.dataset.fallbackTried = 'true'
                      e.target.src = resolveAssetUrl(wallpaper.image_url)
                      return
                    }
                    
                    // If both thumbnail and original fail, show placeholder
                    e.target.style.display = 'none'
                    let placeholder = e.target.parentNode.querySelector('.wallpaper-image-placeholder')
                    if (!placeholder) {
                      placeholder = document.createElement('div')
                      placeholder.className = 'wallpaper-image-placeholder'
                      placeholder.style.cssText = 'width: 100%; height: 120px; background: #111111; display: flex; align-items: center; justify-content: center; color: #666666; font-size: 10px; font-family: inherit;'
                      placeholder.textContent = 'no thumbnail'
                      e.target.parentNode.insertBefore(placeholder, e.target)
                    }
                  }}
                />
                
                <div className="wallpaper-info">
                  <h4 title={wallpaper.filename}>{wallpaper.filename}</h4>
                  
                  <div className="wallpaper-meta">
                    <span>{wallpaper.provider}</span>
                    <span>{formatFileSize(wallpaper.file_size)}</span>
                  </div>
                  
                  <div className="wallpaper-tags">
                    {getTags(wallpaper).map((tag, index) => (
                      <span key={index} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
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
        </>
      )}

      {/* Context Menu */}
      {contextMenu.show && (
        <div 
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item context-menu-item--danger"
            onClick={() => {
              deleteWallpaper(contextMenu.wallpaper, true)
              setContextMenu({ show: false, x: 0, y: 0, wallpaper: null })
            }}
          >
            <Trash2 size={14} />
            Delete File & Database Entry
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div className="confirm-modal-overlay" onClick={hideConfirmModal}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>{confirmModal.title}</h3>
            </div>
            <div className="confirm-modal-body">
              <p>{confirmModal.message}</p>
            </div>
            <div className="confirm-modal-actions">
              <button 
                className="confirm-modal-btn cancel"
                onClick={hideConfirmModal}
              >
                Cancel
              </button>
              <button 
                className={`confirm-modal-btn ${confirmModal.isDangerous ? 'dangerous' : ''}`}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Gallery
