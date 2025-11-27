import { useState, useEffect } from 'react'
import { Trophy, Crown, Medal, Award, TrendingUp, X, ChevronLeft, ChevronRight, RefreshCw, Download, Swords, AlertCircle, Maximize2 } from 'lucide-react'
import axios from 'axios'
import { API_BASE, resolveAssetUrl } from '../config'

function Leaderboard({ onNavigateToArena }) {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedWallpaper, setSelectedWallpaper] = useState(null)
  const [showBottom, setShowBottom] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [modalImageLoaded, setModalImageLoaded] = useState(false)

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
    setModalImageLoaded(false)
  }

  const closeModal = () => {
    setSelectedWallpaper(null)
  }

  const currentItems = leaderboard

  // Skeleton Loading Row Component
  const SkeletonRow = () => (
    <div className="leaderboard-item" style={{ border: '1px solid #222' }}>
      <div className="rank-section">
        <div className="rank-number">
          <div className="skeleton-loader" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
          <div className="skeleton-loader" style={{ width: '24px', height: '14px', borderRadius: '2px' }} />
        </div>
      </div>
      <div className="wallpaper-preview">
        <div className="skeleton-loader" style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="wallpaper-info" style={{ width: '100%' }}>
        <div className="skeleton-loader" style={{ width: '60%', height: '12px', marginBottom: '4px', borderRadius: '2px' }} />
        <div className="wallpaper-meta">
           <div className="skeleton-loader" style={{ width: '30%', height: '10px', borderRadius: '2px' }} />
           <div className="skeleton-loader" style={{ width: '20%', height: '10px', borderRadius: '2px' }} />
        </div>
      </div>
      <div className="battle-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-item">
             <div className="skeleton-loader" style={{ width: '30px', height: '12px', marginBottom: '2px', borderRadius: '2px' }} />
             <div className="skeleton-loader" style={{ width: '20px', height: '8px', borderRadius: '2px' }} />
          </div>
        ))}
      </div>
    </div>
  )

  if (error) {
    return (
      <div className="leaderboard">
        <div className="empty-state">
          <AlertCircle size={48} className="empty-state-icon" />
          <h3 className="empty-state-title">leaderboard unavailable</h3>
          <p className="empty-state-description">
            {error}. please check your connection and try again.
          </p>
          <button onClick={() => fetchLeaderboard(showBottom)} className="empty-state-button">
            <RefreshCw size={16} />
            retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <div className="header-content">
          <Trophy size={24} />
          <h1>arena champions</h1>
          <p>{leaderboard.length || 50} ranked wallpapers</p>
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

      {loading ? (
        <div className="leaderboard-list">
          {Array.from({ length: 20 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="empty-state">
          <Swords size={48} className="empty-state-icon" />
          <h3 className="empty-state-title">arena empty</h3>
          <p className="empty-state-description">
            no battles have been fought yet. be the first to enter the arena and start ranking wallpapers!
          </p>
          {onNavigateToArena && (
            <button onClick={onNavigateToArena} className="empty-state-button">
              <Swords size={16} />
              enter the arena
            </button>
          )}
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
                    src={resolveAssetUrl(wallpaper.thumbnail_url)}
                    alt={wallpaper.filename}
                    className="preview-image clickable"
                    style={{ opacity: 0, transition: 'opacity 0.3s ease' }}
                    onLoad={(e) => e.target.style.opacity = 1}
                    onError={(e) => {
                      const fullImageSrc = resolveAssetUrl(wallpaper.image_url)
                      if (!e.target.dataset.fallbackTried) {
                        e.target.dataset.fallbackTried = 'true'
                        e.target.src = fullImageSrc
                        return
                      }
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
                {!modalImageLoaded && <div className="modal-image-skeleton" aria-hidden="true" />}
                <img
                  src={resolveAssetUrl(selectedWallpaper.image_url)}
                  alt={selectedWallpaper.filename}
                  className={`modal-image ${modalImageLoaded ? 'loaded' : ''}`}
                  loading="eager"
                  onError={e => {
                    e.target.src = resolveAssetUrl(selectedWallpaper.thumbnail_url)
                  }}
                  onLoad={() => setModalImageLoaded(true)}
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
                  <button
                    className="download-btn fullscreen-btn"
                    onClick={() => window.open(resolveAssetUrl(selectedWallpaper.image_url), '_blank')}
                  >
                    <Maximize2 size={16} />
                    view fullscreen
                  </button>
                  <button
                    className="download-btn"
                    onClick={() => window.open(`${API_BASE}/api/download/${selectedWallpaper.id}`, '_blank')}
                  >
                    <Download size={16} />
                    direct download
                  </button>
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
