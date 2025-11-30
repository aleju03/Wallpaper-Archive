import { useState, useRef, useCallback } from 'react'
import axios from 'axios'
import { UploadCloud, CheckCircle, AlertCircle, Hash, Image as ImageIcon, FolderOpen, Tag, Github, Music, Search, X, Check, AlertTriangle } from 'lucide-react'
import { API_BASE, resolveAssetUrl, getAdminHeaders } from '../config'
import { useAdminData } from '../context/useAdminData'

function Upload() {
  const [mode, setMode] = useState('manual')
  const [files, setFiles] = useState([])
  const [provider, setProvider] = useState('')
  const [folder, setFolder] = useState('')
  const [tags, setTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importError, setImportError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)
  const { fetchStats, fetchProviders } = useAdminData()

  // osu! specific state
  const [osuPath, setOsuPath] = useState('C:\\Users\\aleji\\AppData\\Local\\osu!\\Songs')
  const [osuBeatmaps, setOsuBeatmaps] = useState([])
  const [osuScanning, setOsuScanning] = useState(false)
  const [osuImporting, setOsuImporting] = useState(false)
  const [osuError, setOsuError] = useState(null)
  const [osuResult, setOsuResult] = useState(null)
  const [osuSearchFilter, setOsuSearchFilter] = useState('')
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [osuScanProgress, setOsuScanProgress] = useState(null) // { phase, message, percent }
  const [osuPage, setOsuPage] = useState(1)
  const OSU_PAGE_SIZE = 100

  const handleFiles = (event) => {
    setFiles(Array.from(event.target.files || []))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    )
    setFiles(droppedFiles)
  }

  // osu! functions
  const handleOsuScan = async () => {
    if (!osuPath) {
      setOsuError('Please enter the path to your osu! Songs folder')
      return
    }

    setOsuScanning(true)
    setOsuError(null)
    setOsuBeatmaps([])
    setOsuResult(null)
    setOsuScanProgress({ phase: 'connecting', message: 'Connecting...', percent: 0 })

    // Build URL with query params and admin key
    const params = new URLSearchParams({ songsPath: osuPath })
    const adminKey = import.meta.env.VITE_ADMIN_API_KEY || ''
    const url = `${API_BASE}/api/osu/scan?${params}&adminKey=${encodeURIComponent(adminKey)}`

    const eventSource = new EventSource(url)

    eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data)
      setOsuScanProgress(data)
    })

    eventSource.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data)
      if (data.success) {
        setOsuBeatmaps(data.beatmaps)
      } else {
        setOsuError(data.error || 'Scan failed')
      }
      setOsuScanProgress(null)
      setOsuScanning(false)
      eventSource.close()
    })

    eventSource.addEventListener('error', (event) => {
      // Check if it's a custom error event with data
      if (event.data) {
        const data = JSON.parse(event.data)
        setOsuError(data.error || 'Scan failed')
      } else {
        setOsuError('Connection lost during scan')
      }
      setOsuScanProgress(null)
      setOsuScanning(false)
      eventSource.close()
    })

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        // Normal close, ignore
        return
      }
      setOsuError('Failed to connect to scan endpoint')
      setOsuScanProgress(null)
      setOsuScanning(false)
      eventSource.close()
    }
  }

  const toggleBeatmapSelection = useCallback((beatmapId) => {
    setOsuBeatmaps(prev => prev.map(b => 
      b.id === beatmapId ? { ...b, selected: !b.selected } : b
    ))
  }, [])

  const selectAllBeatmaps = () => {
    setOsuBeatmaps(prev => prev.map(b => ({ ...b, selected: true })))
  }

  const deselectAllBeatmaps = () => {
    setOsuBeatmaps(prev => prev.map(b => ({ ...b, selected: false })))
  }

  const selectNonDuplicates = () => {
    setOsuBeatmaps(prev => prev.map(b => ({ ...b, selected: !b.hasDuplicate })))
  }

  const handleOsuImport = async () => {
    const selectedBeatmaps = osuBeatmaps.filter(b => b.selected)
    if (selectedBeatmaps.length === 0) {
      setOsuError('No beatmaps selected for import')
      return
    }

    setOsuImporting(true)
    setOsuError(null)
    setOsuResult(null)

    try {
      const response = await axios.post(`${API_BASE}/api/osu/import`, {
        beatmaps: selectedBeatmaps,
        provider: provider || 'osu'
      }, { headers: getAdminHeaders() })

      if (response.data.success) {
        setOsuResult(response.data)
        // Remove imported beatmaps from the list
        const importedIds = new Set(response.data.imported.map(i => 
          osuBeatmaps.find(b => b.displayTitle === i.displayTitle)?.id
        ).filter(Boolean))
        setOsuBeatmaps(prev => prev.filter(b => !importedIds.has(b.id)))
        
        await Promise.all([
          fetchStats(true),
          fetchProviders(true)
        ])
      } else {
        setOsuError(response.data.error || 'Import failed')
      }
    } catch (err) {
      setOsuError(err.response?.data?.error || 'Failed to import beatmaps')
    } finally {
      setOsuImporting(false)
    }
  }

  // Filter beatmaps based on search and duplicate filter
  const filteredBeatmaps = osuBeatmaps.filter(b => {
    const matchesSearch = !osuSearchFilter || 
      b.displayTitle.toLowerCase().includes(osuSearchFilter.toLowerCase()) ||
      (b.metadata.tags || []).some(t => t.toLowerCase().includes(osuSearchFilter.toLowerCase())) ||
      (b.metadata.source || '').toLowerCase().includes(osuSearchFilter.toLowerCase())
    
    const matchesDuplicateFilter = !showDuplicatesOnly || b.hasDuplicate
    
    return matchesSearch && matchesDuplicateFilter
  })

  // Reset to page 1 when filters change
  const totalFilteredPages = Math.ceil(filteredBeatmaps.length / OSU_PAGE_SIZE)
  const safeOsuPage = Math.min(osuPage, totalFilteredPages) || 1
  
  // Paginate filtered results
  const paginatedBeatmaps = filteredBeatmaps.slice(
    (safeOsuPage - 1) * OSU_PAGE_SIZE,
    safeOsuPage * OSU_PAGE_SIZE
  )

  const selectedCount = osuBeatmaps.filter(b => b.selected).length
  const duplicateCount = osuBeatmaps.filter(b => b.hasDuplicate).length
  
  // Calculate storage size for selected beatmaps
  const selectedBeatmaps = osuBeatmaps.filter(b => b.selected)
  const totalSelectedBytes = selectedBeatmaps.reduce((sum, b) => sum + (b.fileSize || 0), 0)
  const totalAllBytes = osuBeatmaps.reduce((sum, b) => sum + (b.fileSize || 0), 0)
  
  // Format bytes to human readable
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  // Estimate total with thumbnails (~10% extra for compressed thumbnails)
  const estimatedTotalWithThumbs = Math.round(totalSelectedBytes * 1.1)

  const handleUpload = async () => {
    if (!files.length) {
      setError('Select at least one image to upload')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('provider', provider || 'manual')
    if (folder) formData.append('folder', folder)
    if (tags) formData.append('tags', tags)

    files.forEach((file) => {
      formData.append('file', file)
    })

    try {
      const response = await axios.post(`${API_BASE}/api/upload`, formData, {
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'multipart/form-data'
        }
      })
      setResult(response.data)
      setFiles([])
      await Promise.all([
        fetchStats(true),
        fetchProviders(true)
      ])
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="upload">
      <div className="upload__header">
        <div className="upload__title-section">
          <h1 className="upload__title">Asset Upload</h1>
          <p className="upload__subtitle">Import wallpapers from local files or GitHub repositories</p>
        </div>

        <div className="upload__mode-switcher">
          <button
            className={`mode-tab ${mode === 'manual' ? 'mode-tab--active' : ''}`}
            onClick={() => setMode('manual')}
          >
            <UploadCloud size={14} />
            <span>Manual Upload</span>
          </button>
          <button
            className={`mode-tab ${mode === 'github' ? 'mode-tab--active' : ''}`}
            onClick={() => setMode('github')}
          >
            <Github size={14} />
            <span>GitHub Import</span>
          </button>
          <button
            className={`mode-tab ${mode === 'osu' ? 'mode-tab--active' : ''}`}
            onClick={() => setMode('osu')}
          >
            <Music size={14} />
            <span>osu! Import</span>
          </button>
        </div>
      </div>

      {mode === 'manual' && (
        <div className="upload__content">
          <div className="upload__section">
            <h3 className="section-label">Configuration</h3>
            <div className="input-row">
              <div className="input-group">
                <label className="input-label">
                  <FolderOpen size={12} />
                  Provider
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="manual"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">
                  <FolderOpen size={12} />
                  Category
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Optional"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">
                  <Tag size={12} />
                  Tags
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Optional"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="upload__section">
            <h3 className="section-label">Files</h3>
            <div
              className={`dropzone ${isDragging ? 'dropzone--active' : ''} ${files.length > 0 ? 'dropzone--has-files' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFiles}
                style={{ display: 'none' }}
              />

              <div className="dropzone__content">
                <div className="dropzone__icon">
                  <ImageIcon size={32} strokeWidth={1.5} />
                </div>
                <div className="dropzone__text">
                  {files.length > 0 ? (
                    <>
                      <span className="dropzone__title">{files.length} file{files.length !== 1 ? 's' : ''} selected</span>
                      <span className="dropzone__hint">Click or drag to replace</span>
                    </>
                  ) : (
                    <>
                      <span className="dropzone__title">Drop images here</span>
                      <span className="dropzone__hint">or click to browse</span>
                    </>
                  )}
                </div>
              </div>

              {files.length > 0 && (
                <div className="dropzone__files">
                  {files.slice(0, 3).map((file, i) => (
                    <div key={i} className="file-chip">
                      <ImageIcon size={10} />
                      <span>{file.name}</span>
                    </div>
                  ))}
                  {files.length > 3 && (
                    <div className="file-chip file-chip--more">
                      +{files.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              className="btn-upload"
              disabled={uploading || files.length === 0}
              onClick={handleUpload}
            >
              {uploading ? (
                <>
                  <div className="spinner" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <UploadCloud size={14} />
                  <span>Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : ''}</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="alert alert--error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="upload__result">
              {result.success && (
                <div className="alert alert--success">
                  <CheckCircle size={14} />
                  <span>Successfully uploaded {result.uploaded?.length || 0} file{result.uploaded?.length !== 1 ? 's' : ''}</span>
                </div>
              )}

              {result.uploaded?.length > 0 && (
                <div className="result-grid">
                  {result.uploaded.map((item) => (
                    <div key={item.filename} className="result-card">
                      <div className="result-card__thumb">
                        <img src={resolveAssetUrl(item.thumbnail_url)} alt={item.filename} />
                      </div>
                      <div className="result-card__info">
                        <div className="result-card__name">{item.filename}</div>
                        <div className="result-card__meta">
                          <Hash size={10} />
                          <span>Hashed & stored</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.errors?.length > 0 && (
                <div className="alert alert--error">
                  <AlertCircle size={14} />
                  <span>{result.errors.length} error{result.errors.length !== 1 ? 's' : ''} occurred</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'github' && (
        <div className="upload__content">
          <div className="upload__section">
            <h3 className="section-label">Repository Details</h3>
            <div className="input-row">
              <div className="input-group input-group--wide">
                <label className="input-label">
                  <Github size={12} />
                  Repository URL
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">
                  <FolderOpen size={12} />
                  Branch
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Default"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">
                  <Tag size={12} />
                  Provider
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Auto-detect"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="upload__actions">
            <button
              className="btn-secondary"
              disabled={!repoUrl || previewLoading}
              onClick={async () => {
                setPreviewLoading(true)
                setImportError(null)
                try {
                  const response = await axios.post(`${API_BASE}/api/import/repo/preview`, {
                    repoUrl,
                    branch: branch || undefined,
                    limit: 10
                  }, { headers: getAdminHeaders() })
                  setImportPreview(response.data)
                } catch (err) {
                  setImportError(err.response?.data?.error || 'Preview failed')
                  setImportPreview(null)
                } finally {
                  setPreviewLoading(false)
                }
              }}
            >
              {previewLoading ? (
                <>
                  <div className="spinner" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <FolderOpen size={14} />
                  <span>Preview</span>
                </>
              )}
            </button>

            <button
              className="btn-upload"
              disabled={!importPreview || importing}
              onClick={async () => {
                if (!importPreview) return
                setImportError(null)
                setImporting(true)
                try {
                  const response = await axios.post(`${API_BASE}/api/import/repo/import`, {
                    repoUrl,
                    branch: branch || undefined,
                    provider: provider || importPreview.provider_suggested,
                    folderStrategy: 'top-level'
                  }, { headers: getAdminHeaders() })
                  setResult(response.data)
                  await Promise.all([
                    fetchStats(true),
                    fetchProviders(true)
                  ])
                } catch (err) {
                  setImportError(err.response?.data?.error || 'Import failed')
                } finally {
                  setImporting(false)
                }
              }}
            >
              {importing ? (
                <>
                  <div className="spinner" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <UploadCloud size={14} />
                  <span>Import</span>
                </>
              )}
            </button>
          </div>

          {importError && (
            <div className="alert alert--error">
              <AlertCircle size={14} />
              <span>{importError}</span>
            </div>
          )}

          {importPreview && (
            <div className="upload__preview">
              <div className="alert alert--success">
                <CheckCircle size={14} />
                <span>Found {importPreview.total_images} images on branch {importPreview.branch}</span>
              </div>

              <div className="preview-stats">
                <div className="stat-item">
                  <span className="stat-item__label">Provider</span>
                  <span className="stat-item__value">{importPreview.provider_suggested}</span>
                </div>

                {Object.entries(importPreview.by_folder || {}).slice(0, 6).map(([name, count]) => (
                  <div key={name || 'root'} className="stat-item">
                    <span className="stat-item__label">{name || '(root)'}</span>
                    <span className="stat-item__value">{count} images</span>
                  </div>
                ))}
              </div>

              {importPreview.sample?.length > 0 && (
                <div className="preview-gallery">
                  <h3 className="section-label">Sample Images</h3>
                  <div className="preview-grid">
                    {importPreview.sample.slice(0, 10).map((item) => (
                      <div key={item.path} className="preview-card">
                        <img src={item.raw_url} alt={item.filename} loading="lazy" />
                        <div className="preview-card__name">{item.filename}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'osu' && (
        <div className="upload__content">
          <div className="upload__section">
            <h3 className="section-label">osu! Songs Directory</h3>
            <div className="input-row">
              <div className="input-group input-group--wide">
                <label className="input-label">
                  <FolderOpen size={12} />
                  Songs Path
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="C:\Users\...\AppData\Local\osu!\Songs"
                  value={osuPath}
                  onChange={(e) => setOsuPath(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">
                  <Tag size={12} />
                  Provider Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="osu"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </div>
            </div>

            <button
              className="btn-secondary btn-scan"
              disabled={!osuPath || osuScanning}
              onClick={handleOsuScan}
            >
              {osuScanning ? (
                <>
                  <div className="spinner" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>Scan Directory</span>
                </>
              )}
            </button>

            {osuScanProgress && (
              <div className="osu-progress">
                <div className="osu-progress__bar">
                  <div 
                    className="osu-progress__fill" 
                    style={{ width: `${osuScanProgress.percent}%` }}
                  />
                </div>
                <div className="osu-progress__info">
                  <span className="osu-progress__message">{osuScanProgress.message}</span>
                  <span className="osu-progress__percent">{osuScanProgress.percent}%</span>
                </div>
              </div>
            )}
          </div>

          {osuError && (
            <div className="alert alert--error">
              <AlertCircle size={14} />
              <span>{osuError}</span>
            </div>
          )}

          {osuResult && (
            <div className="alert alert--success">
              <CheckCircle size={14} />
              <span>
                Imported {osuResult.summary.imported} beatmaps
                {osuResult.summary.skipped > 0 && `, skipped ${osuResult.summary.skipped}`}
                {osuResult.summary.failed > 0 && `, ${osuResult.summary.failed} failed`}
              </span>
            </div>
          )}

          {osuBeatmaps.length > 0 && (
            <div className="osu-preview">
              <div className="osu-preview__header">
                <div className="osu-preview__stats">
                  <span className="osu-stat">
                    <strong>{osuBeatmaps.length}</strong> beatmaps found
                  </span>
                  <span className="osu-stat osu-stat--selected">
                    <Check size={12} />
                    <strong>{selectedCount}</strong> selected
                  </span>
                  {duplicateCount > 0 && (
                    <span className="osu-stat osu-stat--duplicate">
                      <AlertTriangle size={12} />
                      <strong>{duplicateCount}</strong> potential duplicates
                    </span>
                  )}
                </div>

                <div className="osu-preview__controls">
                  <div className="osu-search">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Filter by title, tags, source..."
                      value={osuSearchFilter}
                      onChange={(e) => {
                        setOsuSearchFilter(e.target.value)
                        setOsuPage(1) // Reset to page 1 when search changes
                      }}
                    />
                    {osuSearchFilter && (
                      <button onClick={() => { setOsuSearchFilter(''); setOsuPage(1); }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <label className="osu-checkbox-filter">
                    <input
                      type="checkbox"
                      checked={showDuplicatesOnly}
                      onChange={(e) => {
                        setShowDuplicatesOnly(e.target.checked)
                        setOsuPage(1) // Reset to page 1 when filter changes
                      }}
                    />
                    <span>Show duplicates only</span>
                  </label>
                </div>
              </div>

              {/* Storage size warning */}
              <div className="osu-storage-info">
                <div className="osu-storage-row">
                  <span className="osu-storage-label">Total scanned:</span>
                  <span className="osu-storage-value">{formatBytes(totalAllBytes)}</span>
                </div>
                <div className="osu-storage-row osu-storage-row--highlight">
                  <span className="osu-storage-label">Selected for upload:</span>
                  <span className="osu-storage-value">{formatBytes(totalSelectedBytes)}</span>
                </div>
                <div className="osu-storage-row">
                  <span className="osu-storage-label">Est. with thumbnails:</span>
                  <span className="osu-storage-value">{formatBytes(estimatedTotalWithThumbs)}</span>
                </div>
                {estimatedTotalWithThumbs > 8 * 1024 * 1024 * 1024 && (
                  <div className="osu-storage-warning">
                    <AlertTriangle size={14} />
                    <span>Warning: This exceeds 8GB - close to R2 free tier limit (10GB)!</span>
                  </div>
                )}
                {estimatedTotalWithThumbs > 10 * 1024 * 1024 * 1024 && (
                  <div className="osu-storage-danger">
                    <AlertCircle size={14} />
                    <span>DANGER: This exceeds the 10GB R2 free tier limit!</span>
                  </div>
                )}
              </div>

              <div className="osu-preview__actions">
                <button className="btn-small" onClick={selectAllBeatmaps}>
                  Select All
                </button>
                <button className="btn-small" onClick={deselectAllBeatmaps}>
                  Deselect All
                </button>
                <button className="btn-small btn-small--accent" onClick={selectNonDuplicates}>
                  Select Non-Duplicates
                </button>
              </div>

              <div className="osu-grid">
                {paginatedBeatmaps.map((beatmap) => (
                  <div
                    key={beatmap.id}
                    className={`osu-card ${beatmap.selected ? 'osu-card--selected' : ''} ${beatmap.hasDuplicate ? 'osu-card--duplicate' : ''}`}
                    onClick={() => toggleBeatmapSelection(beatmap.id)}
                  >
                    <div className="osu-card__thumb">
                      <img src={beatmap.thumbnail} alt={beatmap.displayTitle} loading="lazy" />
                      {beatmap.selected && (
                        <div className="osu-card__check">
                          <Check size={24} />
                        </div>
                      )}
                      {beatmap.hasDuplicate && (
                        <div className="osu-card__duplicate-badge">
                          <AlertTriangle size={12} />
                          <span>Duplicate</span>
                        </div>
                      )}
                    </div>
                    <div className="osu-card__info">
                      <div className="osu-card__title" title={beatmap.displayTitle}>
                        {beatmap.displayTitle}
                      </div>
                      <div className="osu-card__meta">
                        {beatmap.metadata.source && (
                          <span className="osu-card__source">{beatmap.metadata.source}</span>
                        )}
                        <span className="osu-card__dimensions">{beatmap.dimensions}</span>
                      </div>
                      {beatmap.metadata.tags && beatmap.metadata.tags.length > 0 && (
                        <div className="osu-card__tags">
                          {beatmap.metadata.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="osu-tag">{tag}</span>
                          ))}
                          {beatmap.metadata.tags.length > 3 && (
                            <span className="osu-tag osu-tag--more">+{beatmap.metadata.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalFilteredPages > 1 && (
                <div className="osu-pagination">
                  <button 
                    className="btn-small"
                    disabled={safeOsuPage <= 1}
                    onClick={() => setOsuPage(1)}
                  >
                    First
                  </button>
                  <button 
                    className="btn-small"
                    disabled={safeOsuPage <= 1}
                    onClick={() => setOsuPage(p => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className="osu-pagination__info">
                    Page {safeOsuPage} of {totalFilteredPages} ({filteredBeatmaps.length} results)
                  </span>
                  <button 
                    className="btn-small"
                    disabled={safeOsuPage >= totalFilteredPages}
                    onClick={() => setOsuPage(p => Math.min(totalFilteredPages, p + 1))}
                  >
                    Next
                  </button>
                  <button 
                    className="btn-small"
                    disabled={safeOsuPage >= totalFilteredPages}
                    onClick={() => setOsuPage(totalFilteredPages)}
                  >
                    Last
                  </button>
                </div>
              )}

              {filteredBeatmaps.length === 0 && (
                <div className="osu-empty">
                  <p>No beatmaps match your filter</p>
                </div>
              )}

              <button
                className="btn-upload"
                disabled={osuImporting || selectedCount === 0}
                onClick={handleOsuImport}
              >
                {osuImporting ? (
                  <>
                    <div className="spinner" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} />
                    <span>Import {selectedCount} beatmap{selectedCount !== 1 ? 's' : ''}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Upload
