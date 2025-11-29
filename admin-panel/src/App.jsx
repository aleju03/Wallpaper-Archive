import { useState } from 'react'
import { BarChart3, Images, Database, Copy, UploadCloud, Swords } from 'lucide-react'
import Dashboard from './components/Dashboard'
import Gallery from './components/Gallery'
import Statistics from './components/Statistics'
import Duplicates from './components/Duplicates'
import Upload from './components/Upload'
import ArenaStats from './components/ArenaStats'
import './styles/index.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: BarChart3 },
    { id: 'upload', name: 'Upload', icon: UploadCloud },
    { id: 'gallery', name: 'Gallery', icon: Images },
    { id: 'duplicates', name: 'Duplicates', icon: Copy },
    { id: 'arena', name: 'Arena Stats', icon: Swords },
    { id: 'statistics', name: 'Statistics', icon: Database },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />
      case 'upload':
        return <Upload />
      case 'gallery':
        return <Gallery />
      case 'duplicates':
        return <Duplicates />
      case 'arena':
        return <ArenaStats />
      case 'statistics':
        return <Statistics />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/logo.svg" alt="Logo" />
            <h1>Wallpaper Archive</h1>
          </div>
          <p>Admin Panel</p>
        </div>
        
        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="main-content">
        <header className="main-header">
          <h2>
            {navigation.find(item => item.id === activeTab)?.name || 'Dashboard'}
          </h2>
        </header>
        
        <div className="content">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}

export default App
