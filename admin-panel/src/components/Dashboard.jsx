import { useState, useEffect } from 'react'
import { Download, Database, Images, Folder } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      const [statsResponse, providersResponse] = await Promise.all([
        axios.get(`${API_BASE}/api/stats`),
        axios.get(`${API_BASE}/api/providers`)
      ])
      
      setStats(statsResponse.data)
      setProviders(providersResponse.data.providers)
      setError(null)
    } catch (err) {
      setError('Failed to load dashboard data')
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

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
          <div style={{ marginTop: '16px' }}>
            {providers.map((provider, index) => {
              const getStatusColor = (status) => {
                switch(status) {
                  case 'active': return { color: '#27ae60', bg: '#d5f4e6' };
                  case 'recent': return { color: '#f39c12', bg: '#fef9e7' };
                  case 'stale': return { color: '#e74c3c', bg: '#fdebea' };
                  default: return { color: '#95a5a6', bg: '#ecf0f1' };
                }
              };
              
              const statusColors = getStatusColor(provider.status);
              const getStatusText = (status, daysSinceUpdate) => {
                switch(status) {
                  case 'active': return `${provider.count} wallpapers • Updated today`;
                  case 'recent': return `${provider.count} wallpapers • ${daysSinceUpdate}d ago`;
                  case 'stale': return `${provider.count} wallpapers • ${daysSinceUpdate}d ago`;
                  default: return `${provider.count} wallpapers • Unknown`;
                }
              };
              
              return (
                <div key={index} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: index < providers.length - 1 ? '1px solid #eee' : 'none'
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                      {provider.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {getStatusText(provider.status, provider.daysSinceUpdate)}
                    </div>
                  </div>
                  <span style={{ 
                    fontSize: '12px', 
                    color: statusColors.color,
                    background: statusColors.bg,
                    padding: '4px 8px',
                    borderRadius: '12px',
                    textTransform: 'capitalize'
                  }}>
                    {provider.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stat-card">
          <h3>Quick Actions</h3>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={() => window.open(`${API_BASE}/api/wallpapers?limit=10`, '_blank')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px',
                background: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              <Database size={16} />
              View API Response
            </button>
            
            <button 
              onClick={() => window.open(`${API_BASE}/`, '_blank')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px',
                background: '#2ecc71',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
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
