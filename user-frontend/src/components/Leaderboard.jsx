import { useState, useEffect } from 'react'
import { Trophy, Crown, Medal, Award, TrendingUp, X, ChevronLeft, ChevronRight, RefreshCw, Download } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedWallpaper, setSelectedWallpaper] = useState(null)
  const [showBottom, setShowBottom] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  const fetchLeaderboard = async (bottom = false) => {
    try {
      setLoading(true)
      const params = bottom ? '?bottom=true' : ''
      const response = await axios.get(`${API_BASE}/api/arena/leaderboard${params}`)
      
      if (response.data.success) {
        setLeaderboard(response.data.leaderboard)
        setTotalCount(response.data.totalCount)
        setError(null)
      } else {
        setError('Failed to load leaderboard')
      }
    } catch (err) {
      setError('Failed to load leaderboard')
      console.error('Leaderboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  useEffect(() => {
    if (selectedWallpaper) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedWallpaper]);

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return <Crown size={20} className="rank-icon gold" />
      case 2: return <Medal size={20} className="rank-icon silver" />
      case 3: return <Award size={20} className="rank-icon bronze" />
      default: return <Trophy size={16} className="rank-icon default" />
    }
  }

  const getRankClass = (rank) => {
    switch (rank) {
      case 1: return 'rank-1'
      case 2: return 'rank-2'
      case 3: return 'rank-3'
      default: return 'rank-default'
    }
  }

  const formatWinRate = (winRate) => {
    return winRate ? `${winRate}%` : '0%'
  }

  const handleImageClick = (wallpaper) => {
    setSelectedWallpaper(wallpaper)
  }

  const closeModal = () => {
    setSelectedWallpaper(null)
  }

  const currentItems = leaderboard

  if (loading) {
    return (
      <div className="leaderboard loading-container">
        <div className="loading-spinner">
          <Trophy size={32} />
          <p>loading champions...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="leaderboard error-container">
        <p>{error}</p>
        <button onClick={fetchLeaderboard}>retry</button>
      </div>
    )
  }

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <div className="header-content">
          <Trophy size={24} />
          <h1>arena champions</h1>
          <p>{leaderboard.length} ranked wallpapers</p>
          <div className="leaderboard-header-actions">
            <button 
              className={`toggle-btn nav-button ${!showBottom ? 'active' : ''}`}
              onClick={() => {
                setShowBottom(false)
                fetchLeaderboard(false)
              }}
            >
              TOP 50
            </button>
            <button 
              className={`toggle-btn nav-button ${showBottom ? 'active' : ''}`}
              onClick={() => {
                setShowBottom(true)
                fetchLeaderboard(true)
              }}
            >
              BOTTOM 50
            </button>
            <button onClick={() => fetchLeaderboard(showBottom)} className="refresh-button compact" title="Refresh leaderboard">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <div className="empty-leaderboard">
          <p>no battles have been fought yet</p>
          <p>start some arena battles to see the leaderboard!</p>
        </div>
      ) : (
        <div className="leaderboard-list">
          {currentItems.map((wallpaper, index) => {
            const rank = showBottom ? (totalCount - leaderboard.length + index + 1) : (index + 1)
            
            return (
              <div 
                key={wallpaper.id} 
                className={`leaderboard-item ${getRankClass(rank)}`}
              >
                <div className="rank-section">
                  <div className="rank-number">
                    {getRankIcon(rank)}
                    <span className="rank-text">#{rank}</span>
                  </div>
                </div>

                <div className="wallpaper-preview" onClick={() => handleImageClick(wallpaper)}>
                  <img
                    src={`${API_BASE}${wallpaper.thumbnail_url}`}
                    alt={wallpaper.filename}
                    className="preview-image clickable"
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.parentNode.innerHTML += '<div class="preview-placeholder">no preview</div>'
                    }}
                  />
                </div>

                <div className="wallpaper-info">
                  <div className="wallpaper-name">{wallpaper.filename}</div>
                  <div className="wallpaper-meta">
                    <span className="provider">{wallpaper.provider}</span>
                    <span className="dimensions">{wallpaper.dimensions || 'unknown'}</span>
                  </div>
                </div>

                <div className="battle-stats">
                  <div className="stat-item elo-rating">
                    <TrendingUp size={14} />
                    <span className="stat-value">{wallpaper.elo_rating}</span>
                    <span className="stat-label">elo</span>
                  </div>
                  
                  <div className="stat-item battles">
                    <span className="stat-value">{wallpaper.total_battles}</span>
                    <span className="stat-label">battles</span>
                  </div>
                  
                  <div className="stat-item record">
                    <span className="stat-value wins">{wallpaper.battles_won}W</span>
                    <span className="stat-value losses">{wallpaper.battles_lost}L</span>
                  </div>
                  
                  {wallpaper.total_battles > 0 && (
                    <div className="stat-item win-rate">
                      <span className="stat-value">{formatWinRate(wallpaper.win_rate)}</span>
                      <span className="stat-label">win rate</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedWallpaper && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{selectedWallpaper.filename}</div>
              <button className="modal-close" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-image-container">
                <img
                  src={`${API_BASE}${selectedWallpaper.image_url}`}
                  alt={selectedWallpaper.filename}
                  className="modal-image"
                  onError={e => {
                    e.target.src = `${API_BASE}${selectedWallpaper.thumbnail_url}`
                  }}
                />
              </div>
              <div className="modal-sidebar">
                <div className="wallpaper-info">
                  <h3>details</h3>
                  <p><strong>provider:</strong> {selectedWallpaper.provider}</p>
                  <p><strong>dimensions:</strong> {selectedWallpaper.dimensions || 'unknown'}</p>
                  <p><strong>elo rating:</strong> {selectedWallpaper.elo_rating}</p>
                  <p><strong>battles:</strong> {selectedWallpaper.total_battles}</p>
                  <p><strong>record:</strong> {selectedWallpaper.battles_won}W - {selectedWallpaper.battles_lost}L</p>
                  {selectedWallpaper.total_battles > 0 && (
                    <p><strong>win rate:</strong> {formatWinRate(selectedWallpaper.win_rate)}</p>
                  )}
                </div>
                <div className="download-section">
                  <a
                    className="download-btn"
                    href={`${API_BASE}${selectedWallpaper.image_url}`}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={16} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Leaderboard