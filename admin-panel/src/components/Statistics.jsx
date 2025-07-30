import { useState, useEffect } from 'react'
import { BarChart3, PieChart, TrendingUp } from 'lucide-react'
import axios from 'axios'

const API_BASE = 'http://localhost:3000'

function Statistics() {
  const [wallpapers, setWallpapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAllWallpapers()
  }, [])

  const fetchAllWallpapers = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_BASE}/api/wallpapers?limit=10000`)
      setWallpapers(response.data.wallpapers || [])
      setError(null)
    } catch (err) {
      setError('Failed to load statistics')
      console.error('Statistics error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getProviderStats = () => {
    const stats = {}
    wallpapers.forEach(w => {
      stats[w.provider] = (stats[w.provider] || 0) + 1
    })
    return Object.entries(stats)
      .sort(([,a], [,b]) => b - a)
      .map(([provider, count]) => ({ provider, count }))
  }

  const getFolderStats = () => {
    const stats = {}
    wallpapers.forEach(w => {
      if (w.folder) {
        stats[w.folder] = (stats[w.folder] || 0) + 1
      }
    })
    return Object.entries(stats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([folder, count]) => ({ folder, count }))
  }

  const getResolutionStats = () => {
    const stats = {}
    wallpapers.forEach(w => {
      if (w.dimensions) {
        stats[w.dimensions] = (stats[w.dimensions] || 0) + 1
      }
    })
    return Object.entries(stats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([resolution, count]) => ({ resolution, count }))
  }

  const getFileSizeStats = () => {
    const ranges = {
      'Under 1MB': 0,
      '1-5MB': 0,
      '5-10MB': 0,
      'Over 10MB': 0
    }
    
    wallpapers.forEach(w => {
      const sizeMB = (w.file_size || 0) / (1024 * 1024)
      if (sizeMB < 1) ranges['Under 1MB']++
      else if (sizeMB < 5) ranges['1-5MB']++
      else if (sizeMB < 10) ranges['5-10MB']++
      else ranges['Over 10MB']++
    })
    
    return Object.entries(ranges).map(([range, count]) => ({ range, count }))
  }

  if (loading) {
    return <div className="loading">Loading statistics...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  const providerStats = getProviderStats()
  const folderStats = getFolderStats()
  const resolutionStats = getResolutionStats()
  const fileSizeStats = getFileSizeStats()

  return (
    <div className="statistics">
      <div className="stats-grid">
        {/* Provider Distribution */}
        <div className="stat-card">
          <h3>
            <BarChart3 size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Wallpapers by Provider
          </h3>
          <div style={{ marginTop: '16px' }}>
            {providerStats.map(({ provider, count }) => (
              <div key={provider} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #eee'
              }}>
                <span style={{ fontSize: '14px' }}>{provider}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: `${(count / providerStats[0].count) * 100}px`,
                    height: '6px',
                    background: '#3498db',
                    borderRadius: '3px'
                  }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', minWidth: '40px' }}>
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Folders */}
        <div className="stat-card">
          <h3>
            <PieChart size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Top Categories
          </h3>
          <div style={{ marginTop: '16px' }}>
            {folderStats.map(({ folder, count }) => (
              <div key={folder} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #eee'
              }}>
                <span style={{ fontSize: '14px' }}>{folder}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: `${(count / folderStats[0].count) * 80}px`,
                    height: '6px',
                    background: '#2ecc71',
                    borderRadius: '3px'
                  }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', minWidth: '40px' }}>
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution Distribution */}
        <div className="stat-card">
          <h3>
            <TrendingUp size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Common Resolutions
          </h3>
          <div style={{ marginTop: '16px' }}>
            {resolutionStats.map(({ resolution, count }) => (
              <div key={resolution} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #eee'
              }}>
                <span style={{ fontSize: '14px' }}>{resolution}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: `${(count / resolutionStats[0].count) * 60}px`,
                    height: '6px',
                    background: '#e74c3c',
                    borderRadius: '3px'
                  }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', minWidth: '40px' }}>
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* File Size Distribution */}
        <div className="stat-card">
          <h3>File Size Distribution</h3>
          <div style={{ marginTop: '16px' }}>
            {fileSizeStats.map(({ range, count }) => (
              <div key={range} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #eee'
              }}>
                <span style={{ fontSize: '14px' }}>{range}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: `${(count / Math.max(...fileSizeStats.map(s => s.count))) * 60}px`,
                    height: '6px',
                    background: '#f39c12',
                    borderRadius: '3px'
                  }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', minWidth: '40px' }}>
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stat-card" style={{ marginTop: '24px' }}>
        <h3>Collection Summary</h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '24px',
          marginTop: '16px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#3498db' }}>
              {wallpapers.length}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total Wallpapers</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#2ecc71' }}>
              {new Set(wallpapers.map(w => w.provider)).size}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Providers</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#e74c3c' }}>
              {new Set(wallpapers.map(w => w.folder).filter(Boolean)).size}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Unique Folders</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#f39c12' }}>
              {((wallpapers.reduce((sum, w) => sum + (w.file_size || 0), 0)) / (1024 * 1024 * 1024)).toFixed(1)}GB
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total Size</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Statistics