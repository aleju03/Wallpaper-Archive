import { useState } from 'react'
import { Search, BarChart3, Images, Settings, Download, Database, Copy } from 'lucide-react'
import Dashboard from './components/Dashboard'
import Gallery from './components/Gallery'
import Statistics from './components/Statistics'
import Duplicates from './components/Duplicates'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: BarChart3 },
    { id: 'gallery', name: 'Gallery', icon: Images },
    { id: 'duplicates', name: 'Duplicates', icon: Copy },
    { id: 'statistics', name: 'Statistics', icon: Database },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />
      case 'gallery':
        return <Gallery />
      case 'duplicates':
        return <Duplicates />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
            <img src="/logo.svg" alt="Logo" style={{ height: '2em' }} />
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