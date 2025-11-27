import { Github } from 'lucide-react';

function References() {
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
      <span className="references-label">got the wallpapers from:</span>
      <div className="provider-list">
        {providers.map((provider) => (
          <a 
            key={provider.name} 
            href={provider.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="provider-link"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Github size={16} />
            {provider.name}
          </a>
        ))}
      </div>
    </div>
  )
}

export default References
