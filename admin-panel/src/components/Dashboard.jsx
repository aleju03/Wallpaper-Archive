import { useEffect, useState } from 'react'
import axios from 'axios'
import { Trash2 } from 'lucide-react'
import { useAdminData } from '../context/useAdminData'
import { API_BASE } from '../config'

const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY || ''

function StatCardSkeleton() {
  return (
    <div className="stat-card stat-card--skeleton">
      <h3 className="skeleton-text skeleton-text--sm">&nbsp;</h3>
      <div className="value skeleton-text skeleton-text--lg">&nbsp;</div>
      <div className="change skeleton-text skeleton-text--xs">&nbsp;</div>
    </div>
  )
}

function ProviderChipSkeleton() {
  return (
    <div className="provider-chip provider-chip--skeleton">
      <span className="provider-chip__status skeleton-circle" />
      <span className="provider-chip__name skeleton-text">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      <span className="provider-chip__count skeleton-text">&nbsp;&nbsp;</span>
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes.toFixed(1)} ${units[i]}`
}

function Dashboard() {
  const { stats, fetchStats, providerMeta, fetchProviders, statsLoading, providersLoading, errors } = useAdminData()
  const [largestWallpapers, setLargestWallpapers] = useState([])
  const [largestLoading, setLargestLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    fetchStats()
    fetchProviders()
    fetchLargestWallpapers()
  }, [fetchStats, fetchProviders])

  const fetchLargestWallpapers = async () => {
    setLargestLoading(true)
    try {
      const response = await axios.get(`${API_BASE}/api/wallpapers/largest?limit=10`)
      setLargestWallpapers(response.data.wallpapers || [])
    } catch (error) {
      console.error('Failed to fetch largest wallpapers:', error)
    } finally {
      setLargestLoading(false)
    }
  }

  const handleDelete = async (id, filename) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return
    
    setDeleting(id)
    try {
      await axios.delete(`${API_BASE}/api/wallpapers/${id}`, {
        headers: { 'X-Admin-Key': ADMIN_API_KEY }
      })
      setLargestWallpapers(prev => prev.filter(w => w.id !== id))
      fetchStats(true) // Refresh stats after delete
    } catch (error) {
      alert('Failed to delete: ' + (error.response?.data?.error || error.message))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div className="stats-grid">
          {statsLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : errors.stats ? (
            <div className="stat-card stat-card--error">
              <p>{errors.stats}</p>
            </div>
          ) : (
            <>
              <div className="stat-card">
                <h3>Total Wallpapers</h3>
                <div className="value">{stats?.total_wallpapers?.toLocaleString() || '0'}</div>
                <div className="change">Across all providers</div>
              </div>
              
              <div className="stat-card">
                <h3>Providers</h3>
                <div className="value">{stats?.providers || '0'}</div>
                <div className="change">Active sources</div>
              </div>
              
              <div className="stat-card">
                <h3>Categories</h3>
                <div className="value">{stats?.folders || '0'}</div>
                <div className="change">Different folders</div>
              </div>

              <div className="stat-card">
                <h3>Storage Size</h3>
                <div className="value">{((stats?.storage_size || 0) / (1000 * 1000 * 1000)).toFixed(2)}GB</div>
                <div className="change">R2 bucket total</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="provider-status-section">
        <h3>Providers</h3>
        <div className="provider-list">
          {providersLoading ? (
            <>
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
            </>
          ) : errors.providers ? (
            <span className="error-text">{errors.providers}</span>
          ) : (
            providerMeta.map((provider, index) => (
              <div key={index} className="provider-chip">
                <span className={`provider-chip__status provider-chip__status--${provider.status}`} />
                <span className="provider-chip__name">{provider.name}</span>
                <span className="provider-chip__count">{provider.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Largest Wallpapers Section */}
      <div className="largest-section">
        <h3>Largest Files</h3>
        <span className="largest-section__hint">Delete to free up storage</span>
        <div className="largest-list">
          {largestLoading ? (
            <div className="largest-list__loading">Loading...</div>
          ) : largestWallpapers.length === 0 ? (
            <div className="largest-list__empty">No wallpapers found</div>
          ) : (
            largestWallpapers.map((wallpaper) => (
              <div key={wallpaper.id} className="largest-item">
                <img 
                  src={wallpaper.thumbnail_url} 
                  alt={wallpaper.filename}
                  className="largest-item__thumb"
                  loading="lazy"
                />
                <div className="largest-item__info">
                  <span className="largest-item__name" title={wallpaper.filename}>
                    {wallpaper.filename}
                  </span>
                  <span className="largest-item__meta">
                    {wallpaper.dimensions} · {wallpaper.provider}
                  </span>
                </div>
                <span className="largest-item__size">
                  {formatFileSize(wallpaper.file_size)}
                </span>
                <button 
                  className="largest-item__delete"
                  onClick={() => handleDelete(wallpaper.id, wallpaper.filename)}
                  disabled={deleting === wallpaper.id}
                  title="Delete wallpaper"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
