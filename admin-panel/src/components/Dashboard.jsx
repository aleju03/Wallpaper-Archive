import { Database, Images } from 'lucide-react'
import { useEffect } from 'react'
import { API_BASE } from '../config'
import { useAdminData } from '../context/AdminDataContext'

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
          <h3>Database Size</h3>
          <div className="value">{((stats?.total_size || 0) / (1024 * 1024 * 1024)).toFixed(1)}GB</div>
          <div className="change">Total file size</div>
        </div>
      </div>

      <div className="recent-activity">
        <div className="stat-card">
          <h3>Provider Status</h3>
          <div>
            {providerMeta.map((provider, index) => {
              const getStatusStyle = (status) => {
                switch(status) {
                  case 'active': return { color: '#2ecc71' }
                  case 'recent': return { color: '#f1c40f' }
                  case 'stale': return { color: '#e74c3c' }
                  default: return {}
                }
              }

              const getStatusText = (status, daysSinceUpdate) => {
                switch(status) {
                  case 'active': return `${provider.count} wallpapers • Updated today`
                  case 'recent': return `${provider.count} wallpapers • ${daysSinceUpdate}d ago`
                  case 'stale': return `${provider.count} wallpapers • ${daysSinceUpdate}d ago`
                  default: return `${provider.count} wallpapers • Unknown`
                }
              }
              
              return (
                <div key={index} className="provider-item">
                  <div>
                    <div className="provider-item__name">{provider.name}</div>
                    <div className="provider-item__status" style={getStatusStyle(provider.status)}>
                      {getStatusText(provider.status, provider.daysSinceUpdate)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="stat-card">
          <h3>Quick Actions</h3>
          <div className="quick-actions">
            <button 
              className="btn btn--primary"
              onClick={() => window.open(`${API_BASE}/api/wallpapers?limit=10`, '_blank')}
            >
              <Database size={16} />
              View API Response
            </button>
            
            <button 
              className="btn btn--success"
              onClick={() => window.open(`${API_BASE}/`, '_blank')}
            >
              <Images size={16} />
              Open API Docs
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
