import { useState, useEffect } from 'react'
import { Download, Shuffle, Loader } from 'lucide-react'
import { API_BASE } from '../config'

function Random() {
  const [wallpaper, setWallpaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)

  const fetchRandom = async () => {
    setLoading(true)
    setImageLoading(true)
    setWallpaper(null)
    try {
      const res = await fetch(`${API_BASE}/api/wallpapers/random`)
      const data = await res.json()
      if (data.success) {
        setWallpaper(data.wallpaper)
      }
    } catch (error) {
      console.error('Failed to fetch random wallpaper:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRandom()
  }, [])

  const handleDownload = () => {
    if (!wallpaper) return
    const link = document.createElement('a')
    link.href = `${API_BASE}${wallpaper.image_url}`
    link.download = wallpaper.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  return (
    <div className="random-container" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 80px)',
      padding: '20px',
      maxWidth: '1400px',
      margin: '0 auto',
      width: '100%'
    }}>
      <div className="random-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        borderBottom: '1px solid #333',
        paddingBottom: '16px'
      }}>
        <div className="random-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shuffle size={20} />
          <h1 style={{ 
            fontSize: '18px', 
            fontWeight: 'normal', 
            textTransform: 'uppercase', 
            letterSpacing: '1px',
            margin: 0 
          }}>Random Pick</h1>
        </div>
        
        <button 
          onClick={fetchRandom} 
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: '#ffffff',
            color: '#000000',
            border: 'none',
            fontSize: '12px',
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            opacity: loading ? 0.7 : 1
          }}
        >
          <Shuffle size={14} />
          <span>Next Random</span>
        </button>
      </div>

      <div className="random-content" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #333',
        background: '#000',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {loading && !wallpaper ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: '#666'
          }}>
            <div style={{ animation: 'spin 1s linear infinite' }}>
                <Loader size={32} />
            </div>
          </div>
        ) : wallpaper ? (
          <>
            <div className="random-image-container" style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#111'
            }}>
               {imageLoading && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666'
                }}>
                    <div style={{ animation: 'spin 1s linear infinite' }}>
                        <Loader size={32} />
                    </div>
                </div>
               )}
               <img
                src={`${API_BASE}${wallpaper.image_url}`}
                alt={wallpaper.filename}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  opacity: imageLoading ? 0 : 1,
                  transition: 'opacity 0.3s ease'
                }}
                onLoad={() => setImageLoading(false)}
                onError={(e) => {
                    e.target.src = `${API_BASE}${wallpaper.thumbnail_url}`
                    setImageLoading(false)
                }}
               />
            </div>
            
            <div className="random-info" style={{
              padding: '20px',
              borderTop: '1px solid #333',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '20px',
              background: '#000'
            }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ 
                  fontSize: '14px', 
                  fontWeight: 'normal', 
                  marginBottom: '8px',
                  color: '#fff',
                  wordBreak: 'break-all'
                }}>{wallpaper.filename}</h2>
                <div style={{ 
                  display: 'flex', 
                  gap: '16px', 
                  fontSize: '11px', 
                  color: '#888' 
                }}>
                  <span>{wallpaper.provider}</span>
                  {wallpaper.dimensions && <span>{wallpaper.dimensions}</span>}
                  <span>{formatFileSize(wallpaper.file_size)}</span>
                </div>
              </div>
              
              <button 
                onClick={handleDownload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  background: 'none',
                  border: '1px solid #fff',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.target.style.background = '#fff'
                    e.target.style.color = '#000'
                }}
                onMouseLeave={(e) => {
                    e.target.style.background = 'none'
                    e.target.style.color = '#fff'
                }}
              >
                <Download size={16} />
                Download
              </button>
            </div>
          </>
        ) : (
           <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
             Failed to load wallpaper.
           </div>
        )}
      </div>
    </div>
  )
}

export default Random