import { useState, useEffect } from 'react'
import { BarChart3, PieChart, TrendingUp } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

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

  const StatRow = ({ label, count, maxCount, color }) => (
    <div className="stat-row">
      <span className="stat-row__label">{label}</span>
      <div className="stat-row__value">
        <div 
          className={`stat-bar stat-bar--${color}`}
          style={{ width: `${(count / maxCount) * 100}px` }}
        />
        <span className="stat-row__count">{count}</span>
      </div>
    </div>
  )

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
  const maxFileSize = Math.max(...fileSizeStats.map(s => s.count))

  return (
    <div className="statistics">
      <div className="stats-grid">
        {/* Provider Distribution */}
        <div className="stat-card">
          <h3>
            <BarChart3 size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Wallpapers by Provider
          </h3>
          <div>
            {providerStats.map(({ provider, count }) => (
              <StatRow 
                key={provider}
                label={provider}
                count={count}
                maxCount={providerStats[0].count}
                color="blue"
              />
            ))}
          </div>
        </div>

        {/* Top Folders */}
        <div className="stat-card">
          <h3>
            <PieChart size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Top Categories
          </h3>
          <div>
            {folderStats.map(({ folder, count }) => (
              <StatRow 
                key={folder}
                label={folder}
                count={count}
                maxCount={folderStats[0].count}
                color="green"
              />
            ))}
          </div>
        </div>

        {/* Resolution Distribution */}
        <div className="stat-card">
          <h3>
            <TrendingUp size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Common Resolutions
          </h3>
          <div>
            {resolutionStats.map(({ resolution, count }) => (
              <StatRow 
                key={resolution}
                label={resolution}
                count={count}
                maxCount={resolutionStats[0].count}
                color="red"
              />
            ))}
          </div>
        </div>

        {/* File Size Distribution */}
        <div className="stat-card">
          <h3>File Size Distribution</h3>
          <div>
            {fileSizeStats.map(({ range, count }) => (
              <StatRow 
                key={range}
                label={range}
                count={count}
                maxCount={maxFileSize}
                color="orange"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stat-card">
        <h3>Collection Summary</h3>
        <div className="collection-summary">
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--blue">
              {wallpapers.length}
            </div>
            <div className="summary-item__label">Total Wallpapers</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--green">
              {new Set(wallpapers.map(w => w.provider)).size}
            </div>
            <div className="summary-item__label">Providers</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--red">
              {new Set(wallpapers.map(w => w.folder).filter(Boolean)).size}
            </div>
            <div className="summary-item__label">Unique Folders</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--orange">
              {((wallpapers.reduce((sum, w) => sum + (w.file_size || 0), 0)) / (1024 * 1024 * 1024)).toFixed(1)}GB
            </div>
            <div className="summary-item__label">Total Size</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Statistics