import { useState, useEffect, useCallback } from 'react'
import { Trophy, TrendingUp, TrendingDown, AlertTriangle, Swords, RefreshCw, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || ''

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'X-Admin-Key': ADMIN_KEY }
})

function ArenaStats() {
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showHistory, setShowHistory] = useState(true)
  const [historyLimit, setHistoryLimit] = useState(25)

  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/arena/stats')
      if (response.data.success) {
        setStats(response.data.stats)
      }
      setError(null)
    } catch (err) {
      setError('Failed to load arena statistics')
      console.error('Arena stats error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      const response = await api.get(`/api/arena/history?limit=${historyLimit}`)
      if (response.data.success) {
        setHistory(response.data.history)
      }
    } catch (err) {
      console.error('Battle history error:', err)
    } finally {
      setHistoryLoading(false)
    }
  }, [historyLimit])

  useEffect(() => {
    fetchStats()
    fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const resolveAssetUrl = (url) => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`
  }

  if (loading) {
    return (
      <div className="arena-stats-loading">
        <Swords size={32} className="spin" />
        <p>Loading arena statistics...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="arena-stats-error">
        <AlertTriangle size={32} />
        <p>{error}</p>
        <button onClick={fetchStats} className="btn btn-primary">
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="arena-stats">
      <div className="arena-stats-header">
        <h2><Swords size={20} /> Arena Statistics</h2>
        <button onClick={() => { fetchStats(); fetchHistory(); }} className="btn btn-secondary">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Overview Cards */}
      <div className="stats-overview">
        <div className="stat-card">
          <div className="stat-icon"><Trophy size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats?.totalBattles?.toLocaleString() || 0}</div>
            <div className="stat-label">Total Battles</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats?.battlesToday?.toLocaleString() || 0}</div>
            <div className="stat-label">Battles Today</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats?.averageElo || 1000}</div>
            <div className="stat-label">Average ELO</div>
          </div>
        </div>
      </div>

      {/* Most Improved */}
      {stats?.mostImproved?.length > 0 && (
        <div className="stats-section">
          <h3><TrendingUp size={16} /> Most Improved (ELO Gained)</h3>
          <div className="wallpaper-list">
            {stats.mostImproved.map((w, i) => (
              <div key={w.id} className="wallpaper-item">
                <span className="rank">#{i + 1}</span>
                <img 
                  src={resolveAssetUrl(w.thumbnail_url)} 
                  alt={w.filename}
                  className="thumb"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
                <div className="info">
                  <div className="filename">{w.filename}</div>
                  <div className="meta">{w.provider} • {w.total_battles} battles</div>
                </div>
                <div className="elo-change positive">
                  +{w.elo_change} ({w.elo_rating})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Biggest Losers */}
      {stats?.biggestLosers?.length > 0 && (
        <div className="stats-section">
          <h3><TrendingDown size={16} /> Biggest Losers (ELO Lost)</h3>
          <div className="wallpaper-list">
            {stats.biggestLosers.map((w, i) => (
              <div key={w.id} className="wallpaper-item">
                <span className="rank">#{i + 1}</span>
                <img 
                  src={resolveAssetUrl(w.thumbnail_url)} 
                  alt={w.filename}
                  className="thumb"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
                <div className="info">
                  <div className="filename">{w.filename}</div>
                  <div className="meta">{w.provider} • {w.total_battles} battles</div>
                </div>
                <div className="elo-change negative">
                  {w.elo_change} ({w.elo_rating})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controversial */}
      {stats?.controversial?.length > 0 && (
        <div className="stats-section">
          <h3><AlertTriangle size={16} /> Most Controversial (Close Win/Loss Ratio)</h3>
          <div className="wallpaper-list">
            {stats.controversial.map((w, i) => (
              <div key={w.id} className="wallpaper-item">
                <span className="rank">#{i + 1}</span>
                <img 
                  src={resolveAssetUrl(w.thumbnail_url)} 
                  alt={w.filename}
                  className="thumb"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
                <div className="info">
                  <div className="filename">{w.filename}</div>
                  <div className="meta">{w.provider} • {w.battles_won}W/{w.battles_lost}L</div>
                </div>
                <div className="controversy-badge">
                  {Math.round((w.battles_won / w.total_battles) * 100)}% wins
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Battle History */}
      <div className="stats-section">
        <div className="section-header" onClick={() => setShowHistory(!showHistory)}>
          <h3><Clock size={16} /> Recent Battle History</h3>
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        
        {showHistory && (
          <>
            <div className="history-controls">
              <select 
                value={historyLimit} 
                onChange={(e) => setHistoryLimit(Number(e.target.value))}
              >
                <option value={25}>Last 25</option>
                <option value={50}>Last 50</option>
                <option value={100}>Last 100</option>
              </select>
            </div>
            
            {historyLoading ? (
              <div className="loading-text">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="empty-text">No battles recorded yet</div>
            ) : (
              <div className="history-list">
                {history.map((battle) => (
                  <div key={battle.id} className="history-item">
                    <div className="battle-participants">
                      <div className="participant winner">
                        <img 
                          src={resolveAssetUrl(battle.winner_thumbnail_url)} 
                          alt={battle.winner_filename}
                          className="thumb"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                        <div className="participant-info">
                          <span className="name">{battle.winner_filename || 'Unknown'}</span>
                          <span className="elo-diff positive">
                            {battle.winner_elo_before} → {battle.winner_elo_after} 
                            (+{battle.winner_elo_after - battle.winner_elo_before})
                          </span>
                        </div>
                      </div>
                      
                      <div className="vs">vs</div>
                      
                      <div className="participant loser">
                        <img 
                          src={resolveAssetUrl(battle.loser_thumbnail_url)} 
                          alt={battle.loser_filename}
                          className="thumb"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                        <div className="participant-info">
                          <span className="name">{battle.loser_filename || 'Unknown'}</span>
                          <span className="elo-diff negative">
                            {battle.loser_elo_before} → {battle.loser_elo_after}
                            ({battle.loser_elo_after - battle.loser_elo_before})
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="battle-meta">
                      <span className="time">{formatTime(battle.created_at)}</span>
                      {battle.vote_time_ms && (
                        <span className="vote-time">{(battle.vote_time_ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ArenaStats
