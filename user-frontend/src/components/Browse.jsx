import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Grid3X3, Grid2X2, AlignJustify, MonitorSmartphone, Smartphone, Minimize2, SlidersHorizontal, X } from 'lucide-react'
import axios from 'axios'
import { API_BASE, resolveAssetUrl } from '../config'
import References from './References'

const withRetry = async (fn, attempts = 3, delayMs = 200) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
};

function WallpaperCard({ wallpaper, onClick, formatFileSize }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [error, setError] = useState(false)
  const cardRef = useRef(null)

  const thumbnailSrc = resolveAssetUrl(wallpaper.thumbnail_url)
  const fullImageSrc = resolveAssetUrl(wallpaper.image_url)

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect() // Stop observing once visible
        }
      },
      {
        rootMargin: '500px', // Start loading 500px before entering viewport
        threshold: 0
      }
    )

    if (cardRef.current) {
      observer.observe(cardRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div 
      ref={cardRef}
      className="wallpaper-card"
      onClick={() => onClick(wallpaper)}
    >
      {isVisible ? (
        !error ? (
          <img
            src={thumbnailSrc}
            alt={wallpaper.filename}
            className={`wallpaper-image ${imageLoaded ? 'loaded' : ''}`}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              if (!e.target.dataset.fallbackTried) {
                e.target.dataset.fallbackTried = 'true'
                e.target.src = fullImageSrc
                return
              }
              setError(true)
            }}
          />
        ) : (
          <div className="wallpaper-image" style={{ background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '10px', opacity: 1 }}>
            no preview
          </div>
        )
      ) : (
        // Placeholder while not in viewport
        <div className="wallpaper-image-placeholder" />
      )}
      
      <div className="wallpaper-overlay">
        <div className="wallpaper-title">{wallpaper.filename}</div>
        <div className="wallpaper-meta">
          <span className="wallpaper-provider">{wallpaper.provider}</span>
          <span className="wallpaper-resolution">{wallpaper.dimensions || 'unknown'}</span>
          <span className="wallpaper-size">{formatFileSize(wallpaper.file_size)}</span>
        </div>
      </div>
    </div>
  )
}

function Browse({ onWallpaperClick, browseState, setBrowseState }) {
  const {
    wallpapers,
    totalCount,
    totalPages,
    currentPage,
    searchQuery,
    selectedProvider,
    selectedFolders,
    selectedResolution,
    selectedAspect,
    loading,
    initialized
  } = browseState

  // Local display state so the active page flips immediately on click
  // This is the single source of truth for UI highlighting
  const [displayPage, setDisplayPage] = useState(currentPage)

  const [providers, setProviders] = useState([])
  const [folders, setFolders] = useState([])
  const [resolutions, setResolutions] = useState([])
  const [aspects, setAspects] = useState([])
  const [error, setError] = useState(null)
  
  const [gridColumns, setGridColumns] = useState(() => {
    // Set default based on screen size
    if (typeof window !== 'undefined') {
      if (window.innerWidth <= 360) return 2
      if (window.innerWidth <= 768) return 3
    }
    return 4
  }) // 2, 3, or 4 columns
  const itemsPerPage = 24

  // Custom dropdown state
  const [resolutionDropdownOpen, setResolutionDropdownOpen] = useState(false)
  const [resolutionSearch, setResolutionSearch] = useState('')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState('')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const fetchProviders = async () => {
    try {
      const response = await withRetry(() => axios.get(`${API_BASE}/api/providers`))
      const providersData = response.data.providers || []
      const providerNames = providersData.map(p => typeof p === 'string' ? p : p.name)
      setProviders(providerNames)
      
      const foldersData = response.data.folders || []
      setFolders(foldersData)
    } catch (err) {
      console.error('Failed to fetch providers:', err)
    }
  }

  const fetchResolutions = async () => {
    try {
      const response = await withRetry(() => axios.get(`${API_BASE}/api/resolutions`))
      setResolutions(response.data.resolutions || [])
      setAspects(response.data.aspects || [])
    } catch (err) {
      console.error('Failed to fetch resolutions:', err)
      // Fallback to empty array if API not available yet
      setResolutions([])
      setAspects([])
    }
  }

  const fetchWallpapers = useCallback(async (force = false) => {
    // If already initialized and not forced (e.g. by filter change), don't refetch
    if (initialized && !force) return

    // Use currentPage from browseState - it's already set to the target page
    const pageToLoad = currentPage

    try {
      setBrowseState(prev => ({ ...prev, loading: true }))
      const params = new URLSearchParams()
      
      if (searchQuery) params.append('search', searchQuery)
      if (selectedProvider) params.append('provider', selectedProvider)
      if (selectedFolders && selectedFolders.length > 0) {
        params.append('folders', selectedFolders.join(','))
      }
      if (selectedResolution) params.append('resolution', selectedResolution)
      if (selectedAspect) params.append('aspect', selectedAspect)
      params.append('limit', itemsPerPage.toString())
      params.append('page', pageToLoad.toString())
      
      const response = await withRetry(() => axios.get(`${API_BASE}/api/wallpapers?${params}`))
      
      setBrowseState(prev => ({
        ...prev,
        wallpapers: response.data.wallpapers || [],
        totalCount: response.data.total || 0,
        totalPages: Math.ceil((response.data.total || 0) / itemsPerPage),
        loading: false,
        initialized: true
      }))
      setError(null)
    } catch (err) {
      setError('Failed to load wallpapers')
      console.error('Browse error:', err)
      setBrowseState(prev => ({
        ...prev,
        loading: false,
        initialized: true
      }))
    }
  }, [currentPage, itemsPerPage, searchQuery, selectedProvider, selectedFolders, selectedResolution, selectedAspect, initialized, setBrowseState])

  useEffect(() => {
    fetchProviders()
    fetchResolutions()
  }, [])

  useEffect(() => {
    // Initial fetch only if not initialized
    if (!initialized) {
      fetchWallpapers(true)
    }
  }, [fetchWallpapers, initialized])

  // Helper to update state and trigger fetch
  const updateFilter = (key, value) => {
    setDisplayPage(1)
    setBrowseState(prev => ({
      ...prev,
      [key]: value,
      currentPage: 1, // Reset to page 1 on filter change
      loading: true, // Show loading immediately
      initialized: false // Force refetch
    }))
  }

  const updatePage = (newPage) => {
    // Set displayPage synchronously so UI updates immediately
    setDisplayPage(newPage)
    setBrowseState(prev => ({
      ...prev,
      currentPage: newPage,
      loading: true,
      initialized: false
    }))
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.resolution-dropdown-container')) {
        setResolutionDropdownOpen(false)
      }
    }

    if (resolutionDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [resolutionDropdownOpen])

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`
  }

  const handleWallpaperClick = (wallpaper) => {
    onWallpaperClick(wallpaper)
  }


  // Get filtered and limited resolutions for the custom dropdown
  const getFilteredResolutions = () => {
    let filtered = resolutions

    // Filter by search query
    if (resolutionSearch) {
      filtered = filtered.filter(res => 
        res.dimensions.toLowerCase().includes(resolutionSearch.toLowerCase())
      )
    }

    // If no search, show only the most popular ones (top 15)
    if (!resolutionSearch) {
      filtered = filtered.slice(0, 15)
    } else {
      // If searching, limit to top 20 results
      filtered = filtered.slice(0, 20)
    }

    return filtered
  }

  const handleResolutionSelect = (resolution) => {
    updateFilter('selectedResolution', resolution)
    setResolutionDropdownOpen(false)
    setResolutionSearch('')
  }

  const getSelectedResolutionDisplay = () => {
    if (!selectedResolution) return 'all resolutions'
    const res = resolutions.find(r => r.dimensions === selectedResolution)
    return res ? `${res.dimensions} (${res.count.toLocaleString()})` : selectedResolution
  }

  // Get filtered categories for the custom dropdown
  const getFilteredCategories = () => {
    let filtered = folders

    // Filter by search query
    if (categorySearch) {
      filtered = filtered.filter(folder => 
        folder.name.toLowerCase().includes(categorySearch.toLowerCase())
      )
    }

    // Limit results
    filtered = filtered.slice(0, 20)

    return filtered
  }

  // Get top categories for chips display
  const getTopCategories = () => {
    return folders.slice(0, 8)
  }

  // Toggle category selection (multi-select)
  const toggleCategory = (category, closeModal = false) => {
    const isSelected = selectedFolders.includes(category)
    const newFolders = isSelected
      ? selectedFolders.filter(f => f !== category)
      : [...selectedFolders, category]
    
    setDisplayPage(1)
    setBrowseState(prev => ({
      ...prev,
      selectedFolders: newFolders,
      currentPage: 1,
      loading: true,
      initialized: false
    }))
    
    if (closeModal) {
      setCategoryDropdownOpen(false)
      setCategorySearch('')
    }
  }

  const aspectPresets = [
    { label: 'desktop (16:9)', value: '16:9', icon: <MonitorSmartphone size={14} /> },
    { label: 'ultrawide (21:9)', value: '21:9', icon: <AlignJustify size={14} /> },
    { label: 'mobile (9:16)', value: '9:16', icon: <Smartphone size={14} /> },
    { label: 'square (1:1)', value: '1:1', icon: <Minimize2 size={14} /> }
  ]

  const getAspectCount = (value) => {
    const match = aspects.find(a => a.aspect_ratio === value)
    return match ? Number(match.count || 0) : null
  }

  const getGridClass = () => {
    switch (gridColumns) {
      case 2: return 'wallpaper-grid-2'
      case 3: return 'wallpaper-grid-3'
      case 4: return 'wallpaper-grid-4'
      default: return 'wallpaper-grid'
    }
  }

  const getGridIcon = (columns) => {
    switch (columns) {
      case 2: return <Grid2X2 size={14} />
      case 3: return <Grid3X3 size={14} />
      case 4: return <AlignJustify size={14} />
      default: return <Grid3X3 size={14} />
    }
  }

  // Count active filters for mobile badge
  const activeFilterCount = [
    selectedProvider,
    selectedFolders.length > 0,
    selectedResolution,
    selectedAspect
  ].filter(Boolean).length

  const clearAllFilters = () => {
    setBrowseState(prev => ({
      ...prev,
      selectedProvider: '',
      selectedFolders: [],
      selectedResolution: '',
      selectedAspect: '',
      currentPage: 1,
      loading: true,
      initialized: false
    }))
    setDisplayPage(1)
    setMobileFiltersOpen(false)
  }


  return (
    <div className="browse">
      <div className="browse-controls">
        <div className="search-section">
          <div className="search-row">
            <div className="search-bar">
              <Search className="search-icon" size={16} />
              <input
                type="text"
                placeholder="search wallpapers..."
                value={searchQuery}
                onChange={(e) => updateFilter('searchQuery', e.target.value)}
              />
            </div>

            {/* Mobile filter toggle */}
            <button 
              className="mobile-filter-toggle"
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            >
              <SlidersHorizontal size={16} />
              <span>filters</span>
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
            </button>
          </div>
          
          <div className={`filters ${mobileFiltersOpen ? 'mobile-open' : ''}`}>
            {/* Mobile filter header */}
            <div className="mobile-filter-header">
              <span>filters</span>
              <button onClick={() => setMobileFiltersOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <select 
              className="filter-select"
              value={selectedProvider}
              onChange={(e) => updateFilter('selectedProvider', e.target.value)}
            >
              <option value="">all providers</option>
              {providers.map(provider => (
                <option key={provider} value={provider}>{provider.toLowerCase()}</option>
              ))}
            </select>
            
            <div className="resolution-dropdown-container">
              <button
                className="resolution-dropdown-trigger"
                onClick={() => setResolutionDropdownOpen(!resolutionDropdownOpen)}
              >
                <span>{getSelectedResolutionDisplay()}</span>
                <ChevronDown size={14} className={`dropdown-arrow ${resolutionDropdownOpen ? 'open' : ''}`} />
              </button>
              
              {resolutionDropdownOpen && (
                <div className="resolution-dropdown-menu">
                  <div className="resolution-search">
                    <Search size={14} className="search-icon" />
                    <input
                      type="text"
                      placeholder="search resolutions..."
                      value={resolutionSearch}
                      onChange={(e) => setResolutionSearch(e.target.value)}
                    />
                  </div>
                  
                  <div className="resolution-options">
                    <div 
                      className={`resolution-option ${selectedResolution === '' ? 'selected' : ''}`}
                      onClick={() => handleResolutionSelect('')}
                    >
                      all resolutions
                    </div>
                    
                    {getFilteredResolutions().map(resolution => (
                      <div
                        key={resolution.dimensions}
                        className={`resolution-option ${selectedResolution === resolution.dimensions ? 'selected' : ''}`}
                        onClick={() => handleResolutionSelect(resolution.dimensions)}
                      >
                        {resolution.dimensions} ({resolution.count.toLocaleString()})
                      </div>
                    ))}
                    
                    {!resolutionSearch && (
                      <div className="resolution-option-hint">
                        type to search all {resolutions.length} resolutions...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Category chips */}
            <div className="category-chips">
              <span className="chips-label">category:</span>
              {getTopCategories().map(folder => {
                const isActive = selectedFolders.includes(folder.name)
                return (
                  <button
                    key={folder.name}
                    className={`category-chip ${isActive ? 'active' : ''}`}
                    onClick={() => toggleCategory(folder.name)}
                  >
                    <span>{folder.name}</span>
                    <span className="chip-count">{folder.count}</span>
                  </button>
                )
              })}
              {folders.length > 8 && (
                <button
                  className="category-chip more-chip"
                  onClick={() => setCategoryDropdownOpen(true)}
                >
                  <span>more...</span>
                  <span className="chip-count">+{folders.length - 8}</span>
                </button>
              )}
              {/* Show selected categories that aren't in top 8 */}
              {selectedFolders
                .filter(f => !getTopCategories().find(top => top.name === f))
                .map(folderName => (
                  <button
                    key={folderName}
                    className="category-chip active"
                    onClick={() => toggleCategory(folderName)}
                  >
                    <span>{folderName}</span>
                    <X size={12} />
                  </button>
                ))
              }
              {selectedFolders.length > 0 && (
                <button
                  className="category-chip reset-chip"
                  onClick={() => {
                    setDisplayPage(1)
                    setBrowseState(prev => ({
                      ...prev,
                      selectedFolders: [],
                      currentPage: 1,
                      loading: true,
                      initialized: false
                    }))
                  }}
                >
                  <span>clear</span>
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Category search modal */}
            {categoryDropdownOpen && (
              <div className="category-modal-overlay" onClick={() => setCategoryDropdownOpen(false)}>
                <div className="category-modal" onClick={e => e.stopPropagation()}>
                  <div className="category-modal-header">
                    <span>all categories</span>
                    <button onClick={() => setCategoryDropdownOpen(false)}>
                      <X size={18} />
                    </button>
                  </div>
                  <div className="category-modal-search">
                    <Search size={14} className="search-icon" />
                    <input
                      type="text"
                      placeholder="search categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="category-modal-list">
                    {getFilteredCategories().map(folder => (
                      <button
                        key={folder.name}
                        className={`category-modal-item ${selectedFolders.includes(folder.name) ? 'active' : ''}`}
                        onClick={() => toggleCategory(folder.name)}
                      >
                        <span>{folder.name}</span>
                        <span className="item-count">{folder.count.toLocaleString()}</span>
                      </button>
                    ))}
                    {getFilteredCategories().length === 0 && (
                      <div className="category-modal-empty">no categories found</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="aspect-presets">
              {aspectPresets.map(preset => {
                const count = getAspectCount(preset.value)
                const isActive = selectedAspect === preset.value
                return (
                  <button
                    key={preset.value}
                    className={`aspect-chip ${isActive ? 'active' : ''}`}
                    onClick={() => updateFilter('selectedAspect', isActive ? '' : preset.value)}
                    title={preset.label}
                  >
                    {preset.icon}
                    <span>{preset.label}</span>
                    {count !== null && <span className="aspect-count">{count.toLocaleString()}</span>}
                  </button>
                )
              })}
            </div>

            <div className="grid-controls">
              <button
                className={`grid-control-btn ${gridColumns === 2 ? 'active' : ''}`}
                onClick={() => setGridColumns(2)}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  setGridColumns(2)
                }}
                title="2 columns"
              >
                {getGridIcon(2)}
              </button>
              <button
                className={`grid-control-btn ${gridColumns === 3 ? 'active' : ''}`}
                onClick={() => setGridColumns(3)}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  setGridColumns(3)
                }}
                title="3 columns"  
              >
                {getGridIcon(3)}
              </button>
              <button
                className={`grid-control-btn ${gridColumns === 4 ? 'active' : ''}`}
                onClick={() => setGridColumns(4)}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  setGridColumns(4)
                }}
                title="4 columns"
              >
                {getGridIcon(4)}
              </button>
            </div>

            <div className="results-info">
              {totalCount.toLocaleString()} wallpapers found
            </div>

            {/* Mobile filter actions */}
            <div className="mobile-filter-actions">
              {activeFilterCount > 0 && (
                <button className="clear-filters-btn" onClick={clearAllFilters}>
                  clear all filters
                </button>
              )}
              <button className="apply-filters-btn" onClick={() => setMobileFiltersOpen(false)}>
                show {totalCount.toLocaleString()} results
              </button>
            </div>
          </div>

          {/* Mobile filter overlay */}
          {mobileFiltersOpen && (
            <div className="mobile-filter-overlay" onClick={() => setMobileFiltersOpen(false)} />
          )}
        </div>
      </div>

      <div className="wallpaper-grid-container">
        
        {error && <div className="error">{error}</div>}

        {!error && (
          <div className={getGridClass()}>
            {loading ? (
              // Render 24 skeleton cards while loading
              Array.from({ length: itemsPerPage }).map((_, i) => (
                <div key={i} className="skeleton-card" />
              ))
            ) : (
              wallpapers.map((wallpaper) => (
                <WallpaperCard 
                  key={wallpaper.id}
                  wallpaper={wallpaper}
                  onClick={handleWallpaperClick}
                  formatFileSize={formatFileSize}
                />
              ))
            )}
          </div>
        )}
      </div>

      {!error && totalPages > 1 && (
        <div className="pagination-container">
          <div className="pagination-info">
            <span className="pagination-text">
              page {displayPage} of {totalPages.toLocaleString()}
            </span>
          </div>
          
          <div className="pagination">
            <button
              onClick={() => updatePage(1)}
              disabled={displayPage === 1 || loading}
              title="First page"
              className="pagination-nav"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => updatePage(Math.max(1, displayPage - 1))}
              disabled={displayPage === 1 || loading}
              title="Previous page"
              className="pagination-nav"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="pagination-pages">
              {(() => {
                // Show pages in fixed groups of 5: 1-5, 6-10, 11-15, etc.
                const groupSize = 5
                const currentGroup = Math.floor((displayPage - 1) / groupSize)
                const startPage = currentGroup * groupSize + 1
                const endPage = Math.min(startPage + groupSize - 1, totalPages)
                
                return Array.from({ length: endPage - startPage + 1 }, (_, i) => {
                  const pageNum = startPage + i
                  return (
                    <button
                      key={pageNum}
                      onClick={() => updatePage(pageNum)}
                      className={displayPage === pageNum ? 'active' : ''}
                      disabled={loading}
                    >
                      {pageNum}
                    </button>
                  )
                })
              })()}
            </div>
            
            <button
              onClick={() => updatePage(Math.min(totalPages, displayPage + 1))}
              disabled={displayPage === totalPages || loading}
              title="Next page"
              className="pagination-nav"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => updatePage(totalPages)}
              disabled={displayPage === totalPages || loading}
              title="Last page"
              className="pagination-nav"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
          
          <div className="pagination-goto">
            <span className="pagination-goto-label">go to</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              placeholder="#"
              className="pagination-goto-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const page = parseInt(e.target.value, 10)
                  if (page >= 1 && page <= totalPages) {
                    updatePage(page)
                    e.target.value = ''
                    e.target.blur()
                  }
                }
              }}
            />
          </div>
        </div>
      )}
      
      <References />
    </div>
  )
}

export default Browse
