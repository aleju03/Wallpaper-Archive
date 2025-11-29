import { useState, useEffect, useRef } from 'react'
import { Trophy, Zap, Crown, Swords, Eye, X, Download, RefreshCw, AlertCircle, Maximize2, Minimize2, Undo2, Filter, TrendingUp, BarChart3, Columns } from 'lucide-react'
import axios from 'axios'
import { API_BASE, resolveAssetUrl } from '../config'

const withRetry = async (fn, attempts = 2, delayMs = 200) => {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, delayMs))
      }
    }
  }
  throw lastError
}

// Calculate expected win probability
const calculateWinProbability = (playerElo, opponentElo) => {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
}

function Arena() {
  const [battlePair, setBattlePair] = useState(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [battleCount, setBattleCount] = useState(0)
  const [battleStartTime, setBattleStartTime] = useState(null)
  const [imagesLoaded, setImagesLoaded] = useState({ left: false, right: false })
  const [previewWallpaper, setPreviewWallpaper] = useState(null)
  const [previewImageLoaded, setPreviewImageLoaded] = useState(false)
  const [eloResult, setEloResult] = useState(null)
  const [seenIds, setSeenIds] = useState([])
  const [prefetchedPair, setPrefetchedPair] = useState(null)
  const previewContainerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // New feature states
  const [filters, setFilters] = useState({ provider: '', aspect: '', mode: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [availableProviders, setAvailableProviders] = useState([])
  const [availableAspects, setAvailableAspects] = useState([])
  const [lastVote, setLastVote] = useState(null) // For undo functionality
  const [undoTimeout, setUndoTimeout] = useState(null)
  const [canUndo, setCanUndo] = useState(false)
  const [upsetAlert, setUpsetAlert] = useState(null)
  const [showCompareMode, setShowCompareMode] = useState(false)
  const [compareImagesLoaded, setCompareImagesLoaded] = useState({ left: false, right: false })
  const [sessionStats, setSessionStats] = useState({
    votes: [],
    providerVotes: {},
    startTime: Date.now()
  })
  const [showRecap, setShowRecap] = useState(false)

  // Fetch available filters on mount
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [providersRes, resolutionsRes] = await Promise.all([
          axios.get(`${API_BASE}/api/providers`),
          axios.get(`${API_BASE}/api/resolutions`)
        ])
        setAvailableProviders(providersRes.data.providers?.map(p => typeof p === 'string' ? p : p.name) || [])
        setAvailableAspects(resolutionsRes.data.aspects || [])
      } catch (error) {
        console.warn('Failed to fetch filter options:', error)
      }
    }
    fetchFilters()
  }, [])

  const requestBattlePair = async () => {
    const excludeIds = seenIds.length > 0 ? seenIds.slice(-50) : []
    let url = `${API_BASE}/api/arena/battle`
    const params = new URLSearchParams()
    
    if (excludeIds.length > 0) params.append('exclude', excludeIds.join(','))
    if (filters.provider) params.append('provider', filters.provider)
    if (filters.aspect) params.append('aspect', filters.aspect)
    if (filters.mode) params.append('mode', filters.mode)
    
    const queryString = params.toString()
    if (queryString) url += `?${queryString}`
    
    const response = await withRetry(() => axios.get(url))
    if (response.data.success) {
      return response.data.wallpapers
    }
    return null
  }

  const prefetchNextBattle = async () => {
    try {
      const pair = await requestBattlePair()
      if (pair && pair.length >= 2) {
        setPrefetchedPair(pair)
      }
    } catch (error) {
      console.warn('Prefetch battle failed', error)
    }
  }

  const fetchBattle = async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true)
      }
      setEloResult(null)
      setImagesLoaded({ left: false, right: false })
      setUpsetAlert(null)
      
      let pair = prefetchedPair
      if (pair && pair.length >= 2) {
        setPrefetchedPair(null)
      } else {
        pair = await requestBattlePair()
      }

      if (pair && pair.length >= 2) {
        setBattlePair(pair)
        setBattleStartTime(Date.now())
        const newIds = pair.map(w => w.id)
        setSeenIds(prev => [...prev, ...newIds])
        prefetchNextBattle()
      }
    } catch (error) {
      console.error('Failed to fetch battle:', error)
    } finally {
      if (isInitial) {
        setInitialLoading(false)
      }
    }
  }

  const handleVote = async (winnerId, loserId) => {
    if (voting || eloResult) return
    
    const winner = battlePair.find(w => w.id === winnerId)
    const loser = battlePair.find(w => w.id === loserId)
    
    try {
      setVoting(true)
      
      const voteTimeMs = battleStartTime ? Date.now() - battleStartTime : null
      
      const response = await withRetry(() => axios.post(`${API_BASE}/api/arena/vote`, {
        winnerId,
        loserId,
        voteTimeMs
      }))
      
      if (response.data.success) {
        setBattleCount(prev => prev + 1)
        
        const { winner: winnerResult, loser: loserResult } = response.data.result
        
        // Track session stats
        setSessionStats(prev => ({
          ...prev,
          votes: [...prev.votes, {
            winnerId,
            loserId,
            winnerProvider: winner.provider,
            loserProvider: loser.provider,
            timestamp: Date.now()
          }],
          providerVotes: {
            ...prev.providerVotes,
            [winner.provider]: (prev.providerVotes[winner.provider] || 0) + 1
          }
        }))
        
        // Check for upset
        const winnerOldElo = winnerResult.oldElo
        const loserOldElo = loserResult.oldElo
        const isUpset = loserOldElo > winnerOldElo + 100
        
        if (isUpset) {
          const upsetMagnitude = loserOldElo - winnerOldElo
          setUpsetAlert({
            magnitude: upsetMagnitude,
            probability: Math.round(calculateWinProbability(winnerOldElo, loserOldElo) * 100)
          })
        }
        
        setEloResult({
          winnerId,
          loserId,
          winnerDiff: winnerResult.newElo - winnerResult.oldElo,
          loserDiff: loserResult.newElo - loserResult.oldElo
        })
        
        // Store for undo
        setLastVote({
          winnerId,
          loserId,
          winnerOldElo: winnerResult.oldElo,
          loserOldElo: loserResult.oldElo,
          pair: battlePair
        })
        setCanUndo(true)
        
        // Clear undo after 5 seconds
        if (undoTimeout) clearTimeout(undoTimeout)
        const timeout = setTimeout(() => {
          setCanUndo(false)
          setLastVote(null)
        }, 5000)
        setUndoTimeout(timeout)
        
        setVoting(false)

        setTimeout(() => {
          setEloResult(null)
          setUpsetAlert(null)
          fetchBattle()
        }, isUpset ? 1200 : 600)
      } else {
        setVoting(false)
      }
    } catch (error) {
      console.error('Failed to submit vote:', error)
      setVoting(false)
    }
  }

  const handleUndo = async () => {
    if (!lastVote || !canUndo) return
    
    try {
      const response = await axios.post(`${API_BASE}/api/arena/undo`, {
        winnerId: lastVote.winnerId,
        loserId: lastVote.loserId,
        winnerOldElo: lastVote.winnerOldElo,
        loserOldElo: lastVote.loserOldElo
      })
      
      if (response.data.success) {
        setBattleCount(prev => Math.max(0, prev - 1))
        setBattlePair(lastVote.pair)
        setCanUndo(false)
        setLastVote(null)
        if (undoTimeout) clearTimeout(undoTimeout)
        
        // Remove from session stats
        setSessionStats(prev => ({
          ...prev,
          votes: prev.votes.slice(0, -1)
        }))
      }
    } catch (error) {
      console.error('Failed to undo vote:', error)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      
      // Don't trigger during voting or when images aren't loaded
      if (voting || eloResult || !imagesLoaded.left || !imagesLoaded.right) return
      if (!battlePair || battlePair.length < 2) return
      
      // Preview modal open - handle differently
      if (previewWallpaper) {
        if (e.key === 'Escape') {
          setPreviewWallpaper(null)
        }
        return
      }
      
      // Compare mode open
      if (showCompareMode) {
        if (e.key === 'Escape' || e.key === ' ') {
          e.preventDefault()
          setShowCompareMode(false)
        }
        return
      }
      
      switch (e.key) {
        case '1':
        case 'ArrowLeft':
          e.preventDefault()
          handleVote(battlePair[0].id, battlePair[1].id)
          break
        case '2':
        case 'ArrowRight':
          e.preventDefault()
          handleVote(battlePair[1].id, battlePair[0].id)
          break
        case 's':
        case 'S':
          e.preventDefault()
          fetchBattle()
          break
        case ' ':
          e.preventDefault()
          setShowCompareMode(true)
          setCompareImagesLoaded({ left: false, right: false })
          break
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleUndo()
          }
          break
        case 'Escape':
          if (showFilters) setShowFilters(false)
          if (showRecap) setShowRecap(false)
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voting, eloResult, imagesLoaded, battlePair, previewWallpaper, showCompareMode, showFilters, showRecap, canUndo])

  useEffect(() => {
    fetchBattle(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

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

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handlePreview = (wallpaper, event) => {
    event.preventDefault()
    event.stopPropagation()
    setPreviewWallpaper(wallpaper)
    setPreviewImageLoaded(false)
  }

  const closePreview = () => {
    setPreviewWallpaper(null)
  }

  const handlePreviewFullscreen = async () => {
    if (previewContainerRef.current && previewContainerRef.current.requestFullscreen) {
      try {
        await previewContainerRef.current.requestFullscreen()
        return
      } catch (error) {
        console.warn('Fullscreen request failed', error)
      }
    }
    if (previewWallpaper) {
      window.open(resolveAssetUrl(previewWallpaper.image_url), '_blank')
    }
  }

  const handleExitFullscreen = async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen()
      } catch {
        // ignore
      }
    }
  }

  // Generate recap data
  const getRecapData = () => {
    const { votes, providerVotes, startTime } = sessionStats
    const sessionDuration = Math.round((Date.now() - startTime) / 1000 / 60)
    const sortedProviders = Object.entries(providerVotes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
    
    return {
      totalVotes: votes.length,
      sessionDuration,
      favoriteProviders: sortedProviders
    }
  }

  if (initialLoading) {
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
            {(filters.provider || filters.aspect || filters.mode) && (
              <> try removing some filters or </>
            )}
            try downloading more wallpapers from the "browse" tab or check back later.
          </p>
          <button onClick={() => {
            setFilters({ provider: '', aspect: '', mode: '' })
            fetchBattle(true)
          }} className="empty-state-button">
            <RefreshCw size={16} />
            {filters.provider || filters.aspect || filters.mode ? 'clear filters & retry' : 'try again'}
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

      {/* Control bar */}
      <div className="arena-controls">
        <div className="control-group">
          <button 
            className={`control-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} />
            filters
            {(filters.provider || filters.aspect || filters.mode) && (
              <span className="filter-badge">
                {[filters.provider, filters.aspect, filters.mode].filter(Boolean).length}
              </span>
            )}
          </button>
          
          {battleCount >= 5 && (
            <button 
              className="control-btn"
              onClick={() => setShowRecap(true)}
              title="View session summary"
            >
              <BarChart3 size={14} />
              recap
            </button>
          )}
        </div>
        
        <div className="control-group">
          <button 
            className={`control-btn undo-btn ${canUndo ? 'active' : ''}`}
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo last vote"
          >
            <Undo2 size={14} />
            undo
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-row">
            <label>provider:</label>
            <select 
              value={filters.provider} 
              onChange={(e) => setFilters(prev => ({ ...prev, provider: e.target.value }))}
            >
              <option value="">all providers</option>
              {availableProviders.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          
          <div className="filter-row">
            <label>aspect ratio:</label>
            <select 
              value={filters.aspect} 
              onChange={(e) => setFilters(prev => ({ ...prev, aspect: e.target.value }))}
            >
              <option value="">all aspects</option>
              {availableAspects.map(a => (
                <option key={a.aspect_ratio} value={a.aspect_ratio}>{a.aspect_ratio}</option>
              ))}
            </select>
          </div>
          
          <div className="filter-row">
            <label>battle mode:</label>
            <select 
              value={filters.mode} 
              onChange={(e) => setFilters(prev => ({ ...prev, mode: e.target.value }))}
            >
              <option value="">standard</option>
              <option value="newcomers">newcomers ({"<"}5 battles)</option>
              <option value="underdog">underdog matchups</option>
            </select>
          </div>
          
          {(filters.provider || filters.aspect || filters.mode) && (
            <button 
              className="clear-filters-btn"
              onClick={() => setFilters({ provider: '', aspect: '', mode: '' })}
            >
              clear all filters
            </button>
          )}
        </div>
      )}

      <div className="battle-instructions">
        <p>choose the better wallpaper to help rank them!</p>
        <span className="keyboard-hint">
          [1/←] left • [2/→] right • [S] skip • [space] compare
        </span>
      </div>

      {/* Upset Alert */}
      {upsetAlert && (
        <div className="upset-alert">
          <TrendingUp size={18} />
          <span>upset! the underdog won with only {upsetAlert.probability}% chance!</span>
        </div>
      )}

      <div className="battle-arena">
        <div 
          key={battlePair[0].id} 
          className={`battle-card ${voting ? 'voting' : ''} ${!imagesLoaded.left ? 'loading-image' : ''}`}
          onClick={() => {
            if (voting || eloResult || !imagesLoaded.left || !imagesLoaded.right) return
            handleVote(battlePair[0].id, battlePair[1].id)
          }}
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
                e.target.style.display = 'none'
                console.warn(`Failed to load image: ${e.target.src}`)
                setImagesLoaded(prev => ({ ...prev, left: true }))
              }}
            />
            
            {voting && (
              <div className="voting-overlay">
                <div className="voting-spinner">
                  <Zap size={24} />
                </div>
              </div>
            )}

            {eloResult && (eloResult.winnerId === battlePair[0].id || eloResult.loserId === battlePair[0].id) && (
              <div className="elo-indicator-overlay">
                <div className={`elo-change ${eloResult.winnerId === battlePair[0].id ? 'win' : 'loss'}`}>
                  {eloResult.winnerId === battlePair[0].id ? `+${eloResult.winnerDiff}` : eloResult.loserDiff}
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
        </div>

        <div className="vs-divider">
          <span>vs</span>
        </div>
        
        <div 
          key={battlePair[1].id} 
          className={`battle-card ${voting ? 'voting' : ''} ${!imagesLoaded.right ? 'loading-image' : ''}`}
          onClick={() => {
            if (voting || eloResult || !imagesLoaded.left || !imagesLoaded.right) return
            handleVote(battlePair[1].id, battlePair[0].id)
          }}
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
                e.target.style.display = 'none'
                console.warn(`Failed to load image: ${e.target.src}`)
                setImagesLoaded(prev => ({ ...prev, right: true }))
              }}
            />
            
            {voting && (
              <div className="voting-overlay">
                <div className="voting-spinner">
                  <Zap size={24} />
                </div>
              </div>
            )}

            {eloResult && (eloResult.winnerId === battlePair[1].id || eloResult.loserId === battlePair[1].id) && (
              <div className="elo-indicator-overlay">
                <div className={`elo-change ${eloResult.winnerId === battlePair[1].id ? 'win' : 'loss'}`}>
                  {eloResult.winnerId === battlePair[1].id ? `+${eloResult.winnerDiff}` : eloResult.loserDiff}
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
        </div>
      </div>

      <div className="arena-footer">
        <button 
          className="skip-battle" 
          onClick={() => fetchBattle()}
          disabled={voting}
        >
          skip battle
        </button>
      </div>

      {/* Compare Mode Modal */}
      {showCompareMode && battlePair && (
        <div className="modal-overlay compare-overlay" onClick={() => setShowCompareMode(false)}>
          <div className="compare-modal" onClick={e => e.stopPropagation()}>
            <div className="compare-header">
              <h2><Columns size={18} /> side-by-side comparison</h2>
              <button className="modal-close" onClick={() => setShowCompareMode(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="compare-body">
              <div className="compare-image-container">
                {!compareImagesLoaded.left && <div className="modal-image-skeleton" />}
                <img 
                  src={resolveAssetUrl(battlePair[0].image_url)} 
                  alt={battlePair[0].filename}
                  className={`compare-image ${compareImagesLoaded.left ? 'loaded' : ''}`}
                  onLoad={() => setCompareImagesLoaded(prev => ({ ...prev, left: true }))}
                />
                <div className="compare-label">{battlePair[0].filename}</div>
              </div>
              <div className="compare-divider"></div>
              <div className="compare-image-container">
                {!compareImagesLoaded.right && <div className="modal-image-skeleton" />}
                <img 
                  src={resolveAssetUrl(battlePair[1].image_url)} 
                  alt={battlePair[1].filename}
                  className={`compare-image ${compareImagesLoaded.right ? 'loaded' : ''}`}
                  onLoad={() => setCompareImagesLoaded(prev => ({ ...prev, right: true }))}
                />
                <div className="compare-label">{battlePair[1].filename}</div>
              </div>
            </div>
            <div className="compare-hint">press [space] or [esc] to close</div>
          </div>
        </div>
      )}

      {/* Session Recap Modal */}
      {showRecap && (
        <div className="modal-overlay" onClick={() => setShowRecap(false)}>
          <div className="recap-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <BarChart3 size={18} />
                session recap
              </div>
              <button className="modal-close" onClick={() => setShowRecap(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="recap-body">
              {(() => {
                const recap = getRecapData()
                return (
                  <>
                    <div className="recap-stat-grid">
                      <div className="recap-stat">
                        <span className="recap-stat-value">{recap.totalVotes}</span>
                        <span className="recap-stat-label">battles judged</span>
                      </div>
                      <div className="recap-stat">
                        <span className="recap-stat-value">{recap.sessionDuration}m</span>
                        <span className="recap-stat-label">session time</span>
                      </div>
                    </div>
                    
                    {recap.favoriteProviders.length > 0 && (
                      <div className="recap-section">
                        <h4>your favorite providers</h4>
                        <div className="provider-bars">
                          {recap.favoriteProviders.map(([provider, count]) => (
                            <div key={provider} className="provider-bar">
                              <span className="provider-name">{provider}</span>
                              <div className="bar-track">
                                <div 
                                  className="bar-fill" 
                                  style={{ width: `${(count / recap.totalVotes) * 100}%` }}
                                />
                              </div>
                              <span className="provider-count">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {previewWallpaper && (
        <div className="modal-overlay" onClick={closePreview}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{previewWallpaper.filename}</div>
              {isFullscreen && (
                <button className="modal-action" onClick={handleExitFullscreen}>
                  <Minimize2 size={14} />
                  exit fullscreen
                </button>
              )}
              <button className="modal-close" onClick={closePreview}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-image-container" ref={previewContainerRef}>
                {!previewImageLoaded && <div className="modal-image-skeleton" aria-hidden="true" />}
                <img
                  src={resolveAssetUrl(previewWallpaper.image_url)}
                  alt={previewWallpaper.filename}
                  className={`modal-image ${previewImageLoaded ? 'loaded' : ''}`}
                  onError={e => {
                    e.target.src = resolveAssetUrl(previewWallpaper.thumbnail_url)
                  }}
                  onLoad={() => setPreviewImageLoaded(true)}
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
                  <button
                    className="download-btn fullscreen-btn"
                    onClick={handlePreviewFullscreen}
                  >
                    <Maximize2 size={16} />
                    view fullscreen
                  </button>
                  <button
                    className="download-btn"
                    onClick={() => window.open(`${API_BASE}/api/download/${previewWallpaper.id}`, '_blank')}
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

export default Arena
