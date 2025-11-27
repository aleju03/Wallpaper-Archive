import { useState, useEffect } from 'react'
import { Trophy, Zap, Crown, Swords, Eye, X, Download, RefreshCw, AlertCircle } from 'lucide-react'
import axios from 'axios'
import { API_BASE, resolveAssetUrl } from '../config'

function Arena() {
  const [battlePair, setBattlePair] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [battleCount, setBattleCount] = useState(0)
  const [battleStartTime, setBattleStartTime] = useState(null)
  const [imagesLoaded, setImagesLoaded] = useState({ left: false, right: false })
  const [previewWallpaper, setPreviewWallpaper] = useState(null)

  const fetchBattle = async () => {
    try {
      setLoading(true)
      setImagesLoaded({ left: false, right: false })
      const response = await axios.get(`${API_BASE}/api/arena/battle`)
      
      if (response.data.success) {
        setBattlePair(response.data.wallpapers)
        setBattleStartTime(Date.now())
      }
    } catch (error) {
      console.error('Failed to fetch battle:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleVote = async (winnerId, loserId) => {
    try {
      setVoting(true)
      
      // Calculate voting time
      const voteTimeMs = battleStartTime ? Date.now() - battleStartTime : null
      
      const response = await axios.post(`${API_BASE}/api/arena/vote`, {
        winnerId,
        loserId,
        voteTimeMs
      })
      if (response.data.success) {
        setBattleCount(prev => prev + 1)
        // Immediately load next battle
        await fetchBattle()
        setVoting(false) // Reset voting after next battle loads
      } else {
        setVoting(false)
      }
    } catch (error) {
      console.error('Failed to submit vote:', error)
      setVoting(false)
    }
  }

  useEffect(() => {
    fetchBattle()
  }, [])

  useEffect(() => {
    if (previewWallpaper) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [previewWallpaper]);

  const handlePreview = (wallpaper, event) => {
    event.preventDefault()
    event.stopPropagation()
    setPreviewWallpaper(wallpaper)
  }

  const closePreview = () => {
    setPreviewWallpaper(null)
  }


  if (loading) {
    return (
      <div className="arena loading-container">
        <div className="loading-spinner">
          <Swords size={32} />
          <p>preparing battle...</p>
        </div>
      </div>
    )
  }

  if (!battlePair || battlePair.length < 2) {
    return (
      <div className="arena">
        <div className="empty-state">
          <AlertCircle size={48} className="empty-state-icon" />
          <h3 className="empty-state-title">not enough combatants</h3>
          <p className="empty-state-description">
            there aren't enough wallpapers in the collection to form a battle pair.
            try downloading more wallpapers from the "browse" tab or check back later.
          </p>
          <button onClick={fetchBattle} className="empty-state-button">
            <RefreshCw size={16} />
            try again
          </button>
        </div>
      </div>
    )
  }


  return (
    <div className="arena">
      <div className="arena-header">
        <div className="arena-title">
          <Swords size={24} />
          <h1>wallpaper arena</h1>
        </div>
        <div className="arena-stats">
          <div className="stat">
            <Crown size={16} />
            <span>battles: {battleCount}</span>
          </div>
        </div>
      </div>

      <div className="battle-instructions">
        <p>choose the better wallpaper to help rank them!</p>
      </div>

      <div className="battle-arena">
        <div 
          key={battlePair[0].id} 
          className={`battle-card ${voting ? 'voting' : ''} ${!imagesLoaded.left ? 'loading-image' : ''}`}
          onClick={() => !voting && imagesLoaded.left && imagesLoaded.right && handleVote(battlePair[0].id, battlePair[1].id)}
        >
          <div className="battle-image-container">
            {!imagesLoaded.left && (
              <div className="image-loading-indicator">
                <div className="loading-pulse"></div>
              </div>
            )}
            <img
              src={resolveAssetUrl(battlePair[0].image_url)}
              alt={battlePair[0].filename}
              className="battle-image"
              loading="eager"
              onLoad={() => setImagesLoaded(prev => ({ ...prev, left: true }))}
              onError={(e) => {
                // Hide broken images instead of using low-quality thumbnails
                e.target.style.display = 'none'
                console.warn(`Failed to load image: ${e.target.src}`)
                setImagesLoaded(prev => ({ ...prev, left: true })) // Mark as "loaded" to prevent blocking
              }}
            />
            
            {voting && (
              <div className="voting-overlay">
                <div className="voting-spinner">
                  <Zap size={24} />
                </div>
              </div>
            )}
          </div>
          
          <div className="battle-info">
            <div className="wallpaper-name">{battlePair[0].filename}</div>
            <div className="wallpaper-details">
              <span className="provider">{battlePair[0].provider}</span>
              <span className="dimensions">{battlePair[0].dimensions || 'unknown'}</span>
              <span className="elo">
                <Trophy size={12} />
                {battlePair[0].elo_rating}
              </span>
            </div>
            <div className="battle-record">
              {battlePair[0].battles_won}W - {battlePair[0].battles_lost}L
              {battlePair[0].battles_won + battlePair[0].battles_lost > 0 && (
                <span className="win-rate">
                  ({Math.round((battlePair[0].battles_won / (battlePair[0].battles_won + battlePair[0].battles_lost)) * 100)}%)
                </span>
              )}
            </div>
            <button 
              className="preview-btn"
              onClick={(e) => handlePreview(battlePair[0], e)}
              title="Preview image"
            >
              <Eye size={14} />
              preview
            </button>
          </div>

          {!imagesLoaded.left && !voting && (
            <div className="loading-hint">
              loading...
            </div>
          )}
        </div>

        <div className="vs-divider">
          <span>vs</span>
        </div>
        
        <div 
          key={battlePair[1].id} 
          className={`battle-card ${voting ? 'voting' : ''} ${!imagesLoaded.right ? 'loading-image' : ''}`}
          onClick={() => !voting && imagesLoaded.left && imagesLoaded.right && handleVote(battlePair[1].id, battlePair[0].id)}
        >
          <div className="battle-image-container">
            {!imagesLoaded.right && (
              <div className="image-loading-indicator">
                <div className="loading-pulse"></div>
              </div>
            )}
            <img
              src={resolveAssetUrl(battlePair[1].image_url)}
              alt={battlePair[1].filename}
              className="battle-image"
              loading="eager"
              onLoad={() => setImagesLoaded(prev => ({ ...prev, right: true }))}
              onError={(e) => {
                // Hide broken images instead of using low-quality thumbnails
                e.target.style.display = 'none'
                console.warn(`Failed to load image: ${e.target.src}`)
                setImagesLoaded(prev => ({ ...prev, right: true })) // Mark as "loaded" to prevent blocking
              }}
            />
            
            {voting && (
              <div className="voting-overlay">
                <div className="voting-spinner">
                  <Zap size={24} />
                </div>
              </div>
            )}
          </div>
          
          <div className="battle-info">
            <div className="wallpaper-name">{battlePair[1].filename}</div>
            <div className="wallpaper-details">
              <span className="provider">{battlePair[1].provider}</span>
              <span className="dimensions">{battlePair[1].dimensions || 'unknown'}</span>
              <span className="elo">
                <Trophy size={12} />
                {battlePair[1].elo_rating}
              </span>
            </div>
            <div className="battle-record">
              {battlePair[1].battles_won}W - {battlePair[1].battles_lost}L
              {battlePair[1].battles_won + battlePair[1].battles_lost > 0 && (
                <span className="win-rate">
                  ({Math.round((battlePair[1].battles_won / (battlePair[1].battles_won + battlePair[1].battles_lost)) * 100)}%)
                </span>
              )}
            </div>
            <button 
              className="preview-btn"
              onClick={(e) => handlePreview(battlePair[1], e)}
              title="Preview image"
            >
              <Eye size={14} />
              preview
            </button>
          </div>

          {!imagesLoaded.right && !voting && (
            <div className="loading-hint">
              loading...
            </div>
          )}
        </div>
      </div>

      <div className="arena-footer">
        <button 
          className="skip-battle" 
          onClick={fetchBattle}
          disabled={voting}
        >
          skip battle
        </button>
      </div>

      {previewWallpaper && (
        <div className="modal-overlay" onClick={closePreview}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{previewWallpaper.filename}</div>
              <button className="modal-close" onClick={closePreview}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-image-container">
                <img
                  src={resolveAssetUrl(previewWallpaper.image_url)}
                  alt={previewWallpaper.filename}
                  className="modal-image"
                  onError={e => {
                    e.target.src = resolveAssetUrl(previewWallpaper.thumbnail_url)
                  }}
                />
              </div>
              <div className="modal-sidebar">
                <div className="wallpaper-info">
                  <h3>details</h3>
                  <p><strong>provider:</strong> {previewWallpaper.provider}</p>
                  <p><strong>dimensions:</strong> {previewWallpaper.dimensions || 'unknown'}</p>
                  <p><strong>elo rating:</strong> {previewWallpaper.elo_rating}</p>
                  <p><strong>battles:</strong> {previewWallpaper.total_battles || (previewWallpaper.battles_won + previewWallpaper.battles_lost)}</p>
                  <p><strong>record:</strong> {previewWallpaper.battles_won}W - {previewWallpaper.battles_lost}L</p>
                  {(previewWallpaper.battles_won + previewWallpaper.battles_lost) > 0 && (
                    <p><strong>win rate:</strong> {Math.round((previewWallpaper.battles_won / (previewWallpaper.battles_won + previewWallpaper.battles_lost)) * 100)}%</p>
                  )}
                </div>
                <div className="download-section">
                  <a
                    className="download-btn"
                    href={resolveAssetUrl(previewWallpaper.image_url)}
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

export default Arena
