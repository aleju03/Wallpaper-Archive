import { BarChart3, PieChart, TrendingUp } from 'lucide-react'
import { useEffect } from 'react'
import { useAdminData } from '../context/useAdminData'

function Statistics() {
  const { stats, fetchStats, statsLoading, errors } = useAdminData()

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

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

  if (statsLoading && !stats) {
    return <div className="loading">Loading statistics...</div>
  }

  if (errors.stats) {
    return <div className="error">{errors.stats}</div>
  }

  const providerStats = (stats?.providers_breakdown || []).map(item => ({
    provider: item.provider,
    count: item.count
  }))

  const folderStats = (stats?.folder_breakdown || []).map(item => ({
    folder: item.folder,
    count: item.count
  }))

  const resolutionStats = Object.entries(stats?.dimensions || {})
    .sort(([,a], [,b]) => b - a)
    .slice(0, 8)
    .map(([resolution, count]) => ({ resolution, count }))

  const buckets = stats?.file_size_buckets || {}
  const fileSizeStats = [
    { range: 'Under 1MB', count: buckets.under_1mb || 0 },
    { range: '1-5MB', count: buckets.between_1_5mb || 0 },
    { range: '5-10MB', count: buckets.between_5_10mb || 0 },
    { range: 'Over 10MB', count: buckets.over_10mb || 0 }
  ]
  const maxFileSize = Math.max(1, ...fileSizeStats.map(s => s.count))
  const topProviderCount = providerStats[0]?.count || 1
  const topFolderCount = folderStats[0]?.count || 1
  const topResolutionCount = resolutionStats[0]?.count || 1

  return (
    <div className="statistics">
      <div className="stats-grid">
        {/* Provider Distribution */}
        <div className="stat-card stat-card--scrollable">
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
                maxCount={topProviderCount}
                color="blue"
              />
            ))}
          </div>
        </div>

        {/* Top Folders */}
        <div className="stat-card stat-card--scrollable">
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
                maxCount={topFolderCount}
                color="green"
              />
            ))}
          </div>
        </div>

        {/* Resolution Distribution */}
        <div className="stat-card stat-card--scrollable">
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
                maxCount={topResolutionCount}
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
              {stats?.total_wallpapers || 0}
            </div>
            <div className="summary-item__label">Total Wallpapers</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--green">
              {stats?.providers || 0}
            </div>
            <div className="summary-item__label">Providers</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--red">
              {stats?.folders || 0}
            </div>
            <div className="summary-item__label">Unique Folders</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--orange">
              {((stats?.storage_size || 0) / (1000 * 1000 * 1000)).toFixed(2)}GB
            </div>
            <div className="summary-item__label">Storage Size</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Statistics
