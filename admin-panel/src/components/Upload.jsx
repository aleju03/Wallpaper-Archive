import { useState } from 'react'
import axios from 'axios'
import { UploadCloud, CheckCircle, AlertCircle, Hash, Shield, Image as ImageIcon } from 'lucide-react'
import { API_BASE, resolveAssetUrl, getAdminHeaders } from '../config'
import { useAdminData } from '../context/AdminDataContext'

function Upload() {
  const [files, setFiles] = useState([])
  const [provider, setProvider] = useState('')
  const [folder, setFolder] = useState('')
  const [tags, setTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
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
    </div>
  )
}

export default Upload
