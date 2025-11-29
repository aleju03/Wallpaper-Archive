import { useState } from 'react';
import { Github, ChevronDown } from 'lucide-react';

function References() {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const providers = [
    { name: 'BitterSweetcandyshop', url: 'https://github.com/BitterSweetcandyshop/wallpapers' },
    { name: 'D3Ext', url: 'https://github.com/D3Ext/aesthetic-wallpapers' },
    { name: 'dharmx', url: 'https://github.com/dharmx/walls' },
    { name: 'MichaelScopic', url: 'https://github.com/michaelScopic/Wallpapers' },
    { name: 'LpCodes', url: 'https://github.com/LpCodes/wallpaper' },
    { name: 'Dixiedream', url: 'https://github.com/dixiedream/wallpapers' }
  ]

  return (
    <div className="references">
      <button 
        className="references-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>view sources ({providers.length})</span>
        <ChevronDown size={14} className={`toggle-icon ${isExpanded ? 'expanded' : ''}`} />
      </button>
      
      {isExpanded && (
        <div className="provider-list">
          {providers.map((provider) => (
            <a 
              key={provider.name} 
              href={provider.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="provider-link"
            >
              <Github size={14} />
              {provider.name}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default References
