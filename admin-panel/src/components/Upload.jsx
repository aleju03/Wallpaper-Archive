import { useState } from 'react'
import axios from 'axios'
import { UploadCloud, CheckCircle, AlertCircle, Hash, Shield, Image as ImageIcon } from 'lucide-react'
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
  const { fetchStats, fetchProviders } = useAdminData()

  const handleFiles = (event) => {
    setFiles(Array.from(event.target.files || []))
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
      <div className="upload-mode-switch">
        <button
          className={`btn btn--neutral ${mode === 'manual' ? 'btn--active' : ''}`}
          onClick={() => setMode('manual')}
        >
          Manual upload
        </button>
        <button
          className={`btn btn--neutral ${mode === 'github' ? 'btn--active' : ''}`}
          onClick={() => setMode('github')}
        >
          Import from GitHub
        </button>
      </div>

      {mode === 'manual' && (
        <div className="stat-card">
          <h3>
            <UploadCloud size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Upload new wallpapers
          </h3>
          <p style={{ color: '#888', marginBottom: '12px' }}>
            Files are uploaded to storage, hashed for duplicates, and registered in the database automatically.
          </p>

          <div className="upload-grid">
            <div className="upload-field">
              <label>Provider</label>
              <input 
                type="text" 
                placeholder="e.g. manual, custom-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
            <div className="upload-field">
              <label>Folder / Category</label>
              <input 
                type="text" 
                placeholder="Optional folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              />
            </div>
            <div className="upload-field">
              <label>Tags</label>
              <input 
                type="text" 
                placeholder="Optional tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>

          <div className="upload-dropzone">
            <label className="dropzone-label" htmlFor="file-input">
              <ImageIcon size={20} />
              <span>{files.length ? `${files.length} file(s) selected` : 'Click to choose images'}</span>
            </label>
            <input 
              id="file-input"
              type="file" 
              multiple 
              accept="image/*" 
              onChange={handleFiles}
            />
            <button 
              className="btn btn--neutral"
              disabled={uploading}
              onClick={handleUpload}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>

          {error && (
            <div className="error" style={{ marginTop: '12px' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {result && (
            <div className="upload-result">
              {result.success ? (
                <div className="success">
                  <CheckCircle size={16} /> Uploaded {result.uploaded?.length || 0} file(s)
                </div>
              ) : (
                <div className="error">
                  <AlertCircle size={16} /> Some files failed
                </div>
              )}

              {result.uploaded?.length > 0 && (
                <div className="upload-list">
                  {result.uploaded.map((item) => (
                    <div key={item.filename} className="upload-list__item">
                      <div className="upload-list__thumb">
                        <img src={resolveAssetUrl(item.thumbnail_url)} alt={item.filename} />
                      </div>
                      <div>
                        <div className="upload-list__name">{item.filename}</div>
                        <div className="upload-list__meta">
                          <Hash size={12} /> hash saved
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.errors?.length > 0 && (
                <div className="error" style={{ marginTop: '8px' }}>
                  {result.errors.length} error(s) encountered
                </div>
              )}
              <div className="upload-note">
                <Shield size={12} /> Requires admin key header
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'github' && (
        <div className="stat-card">
          <h3>
            <UploadCloud size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Import from GitHub repository
          </h3>
          <p style={{ color: '#888', marginBottom: '12px' }}>
            Paste a repo URL (uses your configured GitHub token), preview images by top-level folder, then import.
          </p>

          <div className="upload-grid">
            <div className="upload-field">
              <label>Repository URL</label>
              <input
                type="text"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>
            <div className="upload-field">
              <label>Branch (optional)</label>
              <input
                type="text"
                placeholder="Defaults to repo default branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>
            <div className="upload-field">
              <label>Provider name (optional)</label>
              <input
                type="text"
                placeholder="Defaults to repo name"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
          </div>

          <div className="import-actions">
            <button
              className="btn btn--neutral"
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
              {previewLoading ? 'Previewing…' : 'Preview'}
            </button>

            <button
              className="btn btn--primary"
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
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>

          {importError && (
            <div className="error" style={{ marginTop: '12px' }}>
              <AlertCircle size={16} /> {importError}
            </div>
          )}

          {importPreview && (
            <div className="upload-result" style={{ marginTop: '16px' }}>
              <div className="success">
                <CheckCircle size={16} /> Found {importPreview.total_images} images on branch {importPreview.branch}
              </div>
              <div className="upload-list">
                <div className="upload-list__item">
                  <div>
                    <div className="upload-list__name">Suggested provider</div>
                    <div className="upload-list__meta">{importPreview.provider_suggested}</div>
                  </div>
                </div>
                {Object.entries(importPreview.by_folder || {}).map(([name, count]) => (
                  <div key={name || 'root'} className="upload-list__item">
                    <div>
                      <div className="upload-list__name">{name || '(root)'}</div>
                      <div className="upload-list__meta">{count} images</div>
                    </div>
                  </div>
                )).slice(0, 6)}
              </div>

              {importPreview.sample?.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div className="upload-list__name">Sample files</div>
                  <div className="sample-grid">
                    {importPreview.sample.slice(0, 10).map((item) => (
                      <div key={item.path} className="sample-card">
                        <div className="sample-thumb">
                          <img src={item.raw_url} alt={item.filename} loading="lazy" />
                        </div>
                        <div className="upload-list__meta">{item.filename}</div>
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
