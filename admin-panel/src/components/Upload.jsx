import { useState, useRef } from 'react'
import axios from 'axios'
import { UploadCloud, CheckCircle, AlertCircle, Hash, Shield, Image as ImageIcon, FolderOpen, Tag, Github } from 'lucide-react'
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
    </div>
  )
}

export default Upload
