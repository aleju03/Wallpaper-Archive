import { useState, useEffect, useCallback } from 'react'
import { Download, Shuffle, Loader } from 'lucide-react'
import { API_BASE, resolveAssetUrl } from '../config'

function Random() {
  const [wallpaper, setWallpaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imageLoading, setImageLoading] = useState(true)

  const fetchRandom = useCallback(async (signal, isInitial = false) => {
    setLoading(true)
    // Only show explicit image loading state if we don't have a wallpaper yet (first load)
    // For subsequent loads, we'll keep the current image visible until the new one is ready
    if (isInitial) setImageLoading(true)
    
    // Handle both direct calls (where signal might be passed) and event handlers (where event is passed)
    const fetchSignal = signal instanceof AbortSignal ? signal : undefined

    try {
      const res = await fetch(`${API_BASE}/api/wallpapers/random?t=${Date.now()}`, { signal: fetchSignal })
      const data = await res.json()
      if (data.success) {
        const newWallpaper = data.wallpaper
        
        // Preload the new image to ensure text and image update simultaneously
        if (newWallpaper.image_url) {
          try {
            const img = new Image()
            img.src = resolveAssetUrl(newWallpaper.image_url)
            await new Promise((resolve) => {
              img.onload = resolve
              img.onerror = resolve
            })
          } catch (e) {
            console.error('Preload failed', e)
          }
        }
        
        if (!fetchSignal?.aborted) {
          setWallpaper(newWallpaper)
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') return
      console.error('Failed to fetch random wallpaper:', error)
    } finally {
      if (!fetchSignal?.aborted) {
        setLoading(false)
        setImageLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchRandom(controller.signal, true)
    return () => controller.abort()
  }, [fetchRandom])

  const handleDownload = () => {
    if (!wallpaper) return
    const link = document.createElement('a')
    link.href = resolveAssetUrl(wallpaper.image_url)
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
        <div className="random-image-container" style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111'
        }}>
           {(loading || imageLoading) && (
            <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                zIndex: 10,
                background: wallpaper ? 'rgba(0,0,0,0.3)' : 'transparent'
            }}>
                <div style={{ animation: 'spin 1s linear infinite' }}>
                    <Loader size={32} />
                </div>
            </div>
           )}
           {wallpaper && (
             <img
              src={resolveAssetUrl(wallpaper.image_url)}
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
                  e.target.src = resolveAssetUrl(wallpaper.thumbnail_url)
                  setImageLoading(false)
              }}
             />
           )}
        </div>
        
        <div className="random-info" style={{
          padding: '20px',
          borderTop: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          background: '#000',
          minHeight: '85px'
        }}>
          {wallpaper ? (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                width: '100%'
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
          ) : (
            // Skeleton State - only for initial load
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="skeleton-loader" style={{ 
                  width: '60%', 
                  height: '20px', 
                  marginBottom: '8px',
                  borderRadius: '4px',
                  background: '#2a2a2a'
                }} />
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="skeleton-loader" style={{ width: '80px', height: '14px', borderRadius: '2px', background: '#2a2a2a' }} />
                  <div className="skeleton-loader" style={{ width: '60px', height: '14px', borderRadius: '2px', background: '#2a2a2a' }} />
                  <div className="skeleton-loader" style={{ width: '70px', height: '14px', borderRadius: '2px', background: '#2a2a2a' }} />
                </div>
              </div>
              <div className="skeleton-loader" style={{ width: '120px', height: '38px', borderRadius: '0px', background: '#2a2a2a' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Random
