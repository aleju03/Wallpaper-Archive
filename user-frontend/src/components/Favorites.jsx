import { Heart } from 'lucide-react'

function Favorites() {
  return (
    <div className="browse">
      <div className="browse-controls">
        <div className="search-section">
          <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
            your favorites
          </h2>
        </div>
      </div>

      <div className="wallpaper-grid-container">
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '300px',
          color: '#666666',
          textAlign: 'center'
        }}>
          <Heart size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
          <h3 style={{ 
            fontSize: '14px', 
            textTransform: 'uppercase', 
            letterSpacing: '1px', 
            marginBottom: '8px',
            color: '#888888'
          }}>
            no favorites yet
          </h3>
          <p style={{ fontSize: '12px', maxWidth: '300px', lineHeight: '1.4' }}>
            favorites functionality is coming soon. you'll be able to save your favorite wallpapers for quick access.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Favorites