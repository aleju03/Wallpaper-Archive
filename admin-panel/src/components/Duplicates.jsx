import { useState, useEffect } from 'react'
import { Copy, Trash2, Eye, RefreshCw, Settings, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import axios from 'axios'

// Simple path utility functions
const path = {
  basename: (filePath, ext) => {
    if (!filePath) return ''
    const name = filePath.split('/').pop() || filePath.split('\\').pop() || ''
    if (ext && name.endsWith(ext)) {
      return name.slice(0, -ext.length)
    }
    return name
  },
  extname: (filePath) => {
    if (!filePath) return ''
    const name = filePath.split('/').pop() || filePath.split('\\').pop() || ''
    const lastDot = name.lastIndexOf('.')
    return lastDot > 0 ? name.slice(lastDot) : ''
  }
}

const API_BASE = 'http://localhost:3000'

const CACHE_KEY = 'wallpaper_duplicates_cache'
const STATUS_CACHE_KEY = 'wallpaper_hash_status_cache'
const CACHE_EXPIRY = 30 * 60 * 1000 // 30 minutes
const STATUS_CACHE_EXPIRY = 2 * 60 * 1000 // 2 minutes for status

function Duplicates() {
  const [allDuplicateGroups, setAllDuplicateGroups] = useState([]) // Store all unfiltered data
  const [duplicateGroups, setDuplicateGroups] = useState([]) // Filtered data for display
  const [hashStatus, setHashStatus] = useState(null)
  const [loading, setLoading] = useState(false) // Start with loading false
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [threshold, setThreshold] = useState(() => {
    // Only load threshold synchronously (fast)
    const cached = localStorage.getItem(`${CACHE_KEY}_threshold`)
    return cached ? parseInt(cached) : 10
  })
  const [selectedImage, setSelectedImage] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(5) // 5 groups per page

  useEffect(() => {
    // Load cached data synchronously first, then fetch fresh data if needed
    loadCachedDataSync()
  }, [])
  
  // Filter groups when threshold changes
  useEffect(() => {
    filterGroupsByThreshold()
  }, [threshold, allDuplicateGroups])

  const loadCachedDataSync = () => {
    try {
      // Load hash status from cache
      const cachedStatus = localStorage.getItem(STATUS_CACHE_KEY)
      const cachedStatusTime = localStorage.getItem(`${STATUS_CACHE_KEY}_time`)
      
      if (cachedStatus && cachedStatusTime) {
        const statusAge = Date.now() - parseInt(cachedStatusTime)
        if (statusAge < STATUS_CACHE_EXPIRY) {
          setHashStatus(JSON.parse(cachedStatus))
        }
      }

      // Load duplicate results from cache (without threshold check)
      const cached = localStorage.getItem(CACHE_KEY)
      const cachedTime = localStorage.getItem(`${CACHE_KEY}_time`)
      
      if (cached && cachedTime) {
        const age = Date.now() - parseInt(cachedTime)
        
        if (age < CACHE_EXPIRY) {
          console.log('📋 Loading cached duplicate results instantly')
          const data = JSON.parse(cached)
          
          // Add image URLs to cached data
          const enhancedGroups = data.duplicateGroups?.map(group => 
            group.map(wallpaper => ({
              ...wallpaper,
              image_url: `/images/${path.basename(wallpaper.local_path)}`,
              thumbnail_url: `/thumbnails/${path.basename(wallpaper.local_path, path.extname(wallpaper.local_path) || '')}.jpg`
            }))
          ) || []
          
          setAllDuplicateGroups(enhancedGroups)
          setLastFetched(new Date(parseInt(cachedTime)))
          
          // Refresh status in background if needed
          const statusAge = Date.now() - (parseInt(localStorage.getItem(`${STATUS_CACHE_KEY}_time`)) || 0)
          if (statusAge > 30000) {
            fetchHashStatus()
          }
          return
        }
      }
      
      // No valid cache, fetch fresh data
      fetchData()
    } catch (error) {
      console.error('Error loading cached data:', error)
      setError('Failed to load duplicate data')
    }
  }
  
  const filterGroupsByThreshold = () => {
    if (allDuplicateGroups.length === 0) return
    
    // Filter groups based on similarity threshold
    const filteredGroups = allDuplicateGroups.map(group => {
      return group.filter(wallpaper => {
        // Keep wallpapers that meet the similarity threshold
        // If no similarity percentage, keep it (original/first in group)
        return !wallpaper.similarity_percentage || wallpaper.similarity_percentage >= (100 - threshold)
      })
    }).filter(group => group.length > 1) // Only keep groups with more than 1 image
    
    setDuplicateGroups(filteredGroups)
    setCurrentPage(1) // Reset to first page when filtering
  }


  const saveCacheData = (data) => {
    try {
      // Only cache essential data, not the enhanced URLs (we can regenerate those)
      const lightData = {
        duplicateGroups: data.duplicateGroups?.map(group => 
          group.map(wallpaper => ({
            id: wallpaper.id,
            filename: wallpaper.filename,
            provider: wallpaper.provider,
            folder: wallpaper.folder,
            file_size: wallpaper.file_size,
            dimensions: wallpaper.dimensions,
            local_path: wallpaper.local_path,
            similarity_distance: wallpaper.similarity_distance,
            similarity_percentage: wallpaper.similarity_percentage
          }))
        ),
        totalGroups: data.totalGroups,
        totalDuplicates: data.totalDuplicates
      }
      
      localStorage.setItem(CACHE_KEY, JSON.stringify(lightData))
      localStorage.setItem(`${CACHE_KEY}_time`, Date.now().toString())
      // Remove threshold from cache key since we no longer filter on server
      localStorage.setItem(`${CACHE_KEY}_threshold`, threshold.toString())
      setLastFetched(new Date())
    } catch (error) {
      console.error('Error saving cache:', error)
    }
  }

  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(`${CACHE_KEY}_time`)
    localStorage.removeItem(`${CACHE_KEY}_threshold`)
    localStorage.removeItem(STATUS_CACHE_KEY)
    localStorage.removeItem(`${STATUS_CACHE_KEY}_time`)
    setLastFetched(null)
    setAllDuplicateGroups([])
    setDuplicateGroups([])
  }

  const fetchData = async (forceRefresh = false) => {
    try {
      setLoading(true)
      await Promise.all([
        fetchHashStatus(),
        fetchDuplicates(forceRefresh)
      ])
      setError(null)
    } catch (err) {
      setError('Failed to load duplicate data')
      console.error('Duplicates error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchHashStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/duplicates/status`)
      const status = response.data.status
      setHashStatus(status)
      
      // Cache the status
      localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(status))
      localStorage.setItem(`${STATUS_CACHE_KEY}_time`, Date.now().toString())
    } catch (err) {
      console.error('Hash status error:', err)
    }
  }

  const fetchDuplicates = async (forceRefresh = false) => {
    try {
      // Fetch all duplicates without threshold filtering (let server decide minimum threshold)
      const url = `${API_BASE}/api/duplicates?threshold=1${forceRefresh ? '&force=true' : ''}`
      const response = await axios.get(url)
      const data = response.data
      setAllDuplicateGroups(data.duplicateGroups || [])
      
      // Save to cache
      saveCacheData(data)
    } catch (err) {
      console.error('Fetch duplicates error:', err)
    }
  }

  const generateHashes = async () => {
    try {
      setGenerating(true)
      const response = await axios.post(`${API_BASE}/api/duplicates/generate-hashes`)
      
      if (response.data.success) {
        await fetchData() // Refresh data after generation
        alert(response.data.message)
      } else {
        alert('Failed to generate hashes: ' + response.data.error)
      }
    } catch (err) {
      alert('Error generating hashes: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  const deleteWallpaper = async (id, deleteFile = false) => {
    if (!confirm('Are you sure you want to delete this wallpaper? This action cannot be undone.')) {
      return
    }

    try {
      const url = `${API_BASE}/api/wallpapers/${id}${deleteFile ? '?deleteFile=true' : ''}`
      const response = await axios.delete(url)
      
      if (response.data.success) {
        // Remove the deleted wallpaper from both all groups and filtered groups
        const updatedAllGroups = allDuplicateGroups.map(group => 
          group.filter(wallpaper => wallpaper.id !== id)
        ).filter(group => group.length > 1) // Remove groups with only one item
        
        const updatedFilteredGroups = duplicateGroups.map(group => 
          group.filter(wallpaper => wallpaper.id !== id)
        ).filter(group => group.length > 1)
        
        setAllDuplicateGroups(updatedAllGroups)
        setDuplicateGroups(updatedFilteredGroups)
        
        // Update cache with new data
        saveCacheData({ duplicateGroups: updatedAllGroups })
        
        alert('Wallpaper deleted successfully')
      } else {
        alert('Failed to delete wallpaper: ' + response.data.error)
      }
    } catch (err) {
      alert('Error deleting wallpaper: ' + err.message)
    }
  }

  const handleThresholdChange = (newThreshold) => {
    setThreshold(newThreshold)
    // Save threshold to localStorage
    localStorage.setItem(`${CACHE_KEY}_threshold`, newThreshold.toString())
    // Filtering will happen automatically via useEffect
  }

  const getFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }
  
  // Pagination calculations
  const totalPages = Math.ceil(duplicateGroups.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentGroups = duplicateGroups.slice(startIndex, endIndex)
  
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  if (loading) {
    return (
      <div className="duplicates">
        <div className="duplicates-header">
          <div className="hash-status">
            {hashStatus && (
              <div className="stat-card">
                <h3>Hash Generation Status</h3>
                <div className="status-info">
                  <div className="status-bar">
                    <div 
                      className="status-fill" 
                      style={{ width: `${hashStatus.percentage}%` }}
                    ></div>
                  </div>
                  <div className="status-text">
                    {hashStatus.withHashes} of {hashStatus.total} images processed ({hashStatus.percentage}%)
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="controls">
            <div className="stat-card">
              <h3>Detection Settings</h3>
              <div className="threshold-control">
                <label>
                  Similarity Threshold: <strong>{threshold}</strong>
                  <span className="threshold-help">
                    (Lower = more strict, Higher = more loose)
                  </span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={threshold}
                  disabled={loading}
                  style={{ width: '100%', marginTop: '8px', opacity: loading ? 0.5 : 1 }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="duplicate-results">
          <div className="loading" style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            <Clock size={48} color="#3498db" />
            <h3 style={{ margin: '16px 0 8px', color: '#3498db' }}>Loading duplicates...</h3>
            <p>{duplicateGroups.length > 0 ? 'Updating results...' : 'Please wait while we load cached results.'}</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  return (
    <div className="duplicates">
      {/* Hash Status and Controls */}
      <div className="duplicates-header">
        <div className="hash-status">
          {hashStatus && (
            <div className="stat-card">
              <h3>Hash Generation Status</h3>
              <div className="status-info">
                <div className="status-bar">
                  <div 
                    className="status-fill" 
                    style={{ width: `${hashStatus.percentage}%` }}
                  ></div>
                </div>
                <div className="status-text">
                  {hashStatus.withHashes} of {hashStatus.total} images processed ({hashStatus.percentage}%)
                </div>
                {hashStatus.withoutHashes > 0 && (
                  <button 
                    onClick={generateHashes}
                    disabled={generating}
                    className="generate-btn"
                    style={{
                      marginTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      background: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: generating ? 'not-allowed' : 'pointer',
                      opacity: generating ? 0.7 : 1
                    }}
                  >
                    {generating ? <Clock size={16} /> : <RefreshCw size={16} />}
                    {generating ? 'Generating...' : `Generate ${hashStatus.withoutHashes} missing hashes`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="controls">
          <div className="stat-card">
            <h3>Detection Settings</h3>
            <div className="threshold-control">
              <label>
                Similarity Threshold: <strong>{threshold}</strong>
                <span className="threshold-help">
                  (Lower = more strict, Higher = more loose)
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={threshold}
                onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => {
                  clearCache()
                  fetchData(true) // Force refresh from server
                }}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  background: '#2ecc71',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                <RefreshCw size={16} />
                Force Refresh Duplicates
              </button>
              
              {lastFetched && (
                <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                  Last updated: {lastFetched.toLocaleTimeString()}
                  <br />
                  (Results cached for 30 minutes)
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate Groups */}
      <div className="duplicate-results">
        {duplicateGroups.length === 0 ? (
          <div className="no-duplicates">
            <CheckCircle size={48} color="#27ae60" />
            <h3>No duplicates found!</h3>
            <p>
              {hashStatus?.percentage === 100 
                ? 'All images have been analyzed and no duplicates were detected.'
                : 'Generate hashes for all images first to detect duplicates.'
              }
            </p>
          </div>
        ) : (
          <div className="duplicate-groups">
            <div className="results-summary">
              <AlertTriangle size={20} color="#f39c12" />
              <span>Found {duplicateGroups.length} duplicate groups with {duplicateGroups.reduce((sum, group) => sum + group.length, 0)} total images</span>
              {totalPages > 1 && (
                <span style={{ marginLeft: '16px', color: '#666' }}>
                  (Page {currentPage} of {totalPages})
                </span>
              )}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  previous
                </button>
                
                <span style={{ margin: '0 16px', fontSize: '11px', color: '#888888' }}>
                  page {currentPage} of {totalPages}
                </span>
                
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  next
                </button>
              </div>
            )}

            {currentGroups.map((group, groupIndex) => (
              <div key={startIndex + groupIndex} className="duplicate-group">
                <h4>Duplicate Group {startIndex + groupIndex + 1} ({group.length} images)</h4>
                <div className="image-grid">
                  {group.map((wallpaper, imageIndex) => (
                    <div key={wallpaper.id} className="image-card">
                      <div className="image-container">
                        <img
                          src={`${API_BASE}${wallpaper.thumbnail_url}`}
                          alt={wallpaper.filename}
                          onClick={() => setSelectedImage(`${API_BASE}${wallpaper.image_url}`)}
                          style={{ cursor: 'pointer' }}
                        />
                        {wallpaper.similarity_percentage && (
                          <div className="similarity-badge">
                            {wallpaper.similarity_percentage}% similar
                          </div>
                        )}
                      </div>
                      
                      <div className="image-info">
                        <h5>{wallpaper.filename}</h5>
                        <div className="metadata">
                          <div>Provider: {wallpaper.provider}</div>
                          <div>Size: {getFileSize(wallpaper.file_size)}</div>
                          <div>Dimensions: {wallpaper.dimensions}</div>
                          {wallpaper.folder && <div>Folder: {wallpaper.folder}</div>}
                        </div>
                        
                        <div className="actions">
                          <button
                            onClick={() => setSelectedImage(`${API_BASE}${wallpaper.image_url}`)}
                            className="action-btn view"
                            title="View full size"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => deleteWallpaper(wallpaper.id, false)}
                            className="action-btn delete"
                            title="Delete from database"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteWallpaper(wallpaper.id, true)}
                            className="action-btn delete-file"
                            title="Delete file and database entry"
                          >
                            <Trash2 size={16} />
                            File
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Bottom Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                >
                  first
                </button>
                
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  previous
                </button>
                
                <span style={{ margin: '0 16px', fontSize: '11px', color: '#888888' }}>
                  {currentPage} of {totalPages} ({duplicateGroups.length} total groups)
                </span>
                
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  next
                </button>
                
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  last
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="image-modal" onClick={() => setSelectedImage(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <img src={selectedImage} alt="Full size wallpaper" />
            <button 
              className="modal-close"
              onClick={() => setSelectedImage(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Duplicates