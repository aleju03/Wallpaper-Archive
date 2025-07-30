import { useState, useEffect } from 'react'
import { Download, Database, Images, Folder } from 'lucide-react'
import axios from 'axios'

const API_BASE = 'http://localhost:3000'

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
      
      setStats(statsResponse.data.stats)
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
          <div className="value">{stats?.total?.toLocaleString() || '0'}</div>
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
          <div className="value">{((stats?.total || 0) * 2.5).toFixed(1)}MB</div>
          <div className="change">Estimated</div>
        </div>
      </div>

      <div className="recent-activity">
        <div className="stat-card">
          <h3>Active Providers</h3>
          <div style={{ marginTop: '16px' }}>
            {providers.map((provider, index) => (
              <div key={index} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: index < providers.length - 1 ? '1px solid #eee' : 'none'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>{provider}</span>
                <span style={{ 
                  fontSize: '12px', 
                  color: '#27ae60',
                  background: '#d5f4e6',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="stat-card">
          <h3>Quick Actions</h3>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={() => window.open('http://localhost:3000/api/wallpapers?limit=10', '_blank')}
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
              onClick={() => window.open('http://localhost:3000', '_blank')}
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