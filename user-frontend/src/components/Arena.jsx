import { useState, useEffect } from 'react'
import { Trophy, Zap, Crown, Swords } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config'

function Arena() {
  const [battlePair, setBattlePair] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [battleCount, setBattleCount] = useState(0)
  const [battleStartTime, setBattleStartTime] = useState(null)

  const fetchBattle = async () => {
    try {
      setLoading(true)
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
      <div className="arena error-container">
        <p>not enough wallpapers for battle</p>
        <button onClick={fetchBattle}>try again</button>
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
          className={`battle-card ${voting ? 'voting' : ''}`}
          onClick={() => !voting && handleVote(battlePair[0].id, battlePair[1].id)}
        >
          <div className="battle-image-container">
            <img
              src={`${API_BASE}${battlePair[0].image_url}`}
              alt={battlePair[0].filename}
              className="battle-image"
              loading="eager"
              onError={(e) => {
                // Hide broken images instead of using low-quality thumbnails
                e.target.style.display = 'none'
                console.warn(`Failed to load image: ${e.target.src}`)
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
          </div>

          {!voting && (
            <div className="click-hint">
              click to choose
            </div>
          )}
        </div>

        <div className="vs-divider">
          <span>vs</span>
        </div>
        
        <div 
          key={battlePair[1].id} 
          className={`battle-card ${voting ? 'voting' : ''}`}
          onClick={() => !voting && handleVote(battlePair[1].id, battlePair[0].id)}
        >
          <div className="battle-image-container">
            <img
              src={`${API_BASE}${battlePair[1].image_url}`}
              alt={battlePair[1].filename}
              className="battle-image"
              loading="eager"
              onError={(e) => {
                // Hide broken images instead of using low-quality thumbnails
                e.target.style.display = 'none'
                console.warn(`Failed to load image: ${e.target.src}`)
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
          </div>

          {!voting && (
            <div className="click-hint">
              click to choose
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
    </div>
  )
}

export default Arena