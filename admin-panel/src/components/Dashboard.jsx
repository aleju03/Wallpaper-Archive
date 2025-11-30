import { Database, Images } from 'lucide-react'
import { useEffect } from 'react'
import { API_BASE } from '../config'
import { useAdminData } from '../context/useAdminData'

function Dashboard() {
  const { stats, fetchStats, providerMeta, fetchProviders, statsLoading, providersLoading, errors } = useAdminData()
  const loading = statsLoading || providersLoading
  const error = errors.stats || errors.providers

  useEffect(() => {
    fetchStats()
    fetchProviders()
  }, [fetchStats, fetchProviders])

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div className="stats-grid">
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
        </div>

        <div className="quick-actions-inline">
          <button 
            className="btn btn--primary"
            onClick={() => window.open(`${API_BASE}/api/wallpapers?limit=10`, '_blank')}
          >
            <Database size={16} />
            View API
          </button>
          
          <button 
            className="btn btn--success"
            onClick={() => window.open(`${API_BASE}/`, '_blank')}
          >
            <Images size={16} />
            API Docs
          </button>
        </div>
      </div>

      <div className="provider-status-section">
        <h3>Providers</h3>
        <div className="provider-list">
          {providerMeta.map((provider, index) => (
            <div key={index} className="provider-chip">
              <span className={`provider-chip__status provider-chip__status--${provider.status}`} />
              <span className="provider-chip__name">{provider.name}</span>
              <span className="provider-chip__count">{provider.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
