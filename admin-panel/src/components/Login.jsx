import { useState, useEffect } from 'react'
import axios from 'axios'
import { Terminal, Lock, ChevronRight } from 'lucide-react'
import { API_BASE } from '../config'
import '../styles/pages/login.css'

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [focusedInput, setFocusedInput] = useState(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await axios.post(`${API_BASE}/api/auth/login`, {
        username,
        password
      })

      if (response.data.success) {
        localStorage.setItem('admin_token', response.data.token)
        localStorage.setItem('admin_user', JSON.stringify(response.data.user))
        onLoginSuccess(response.data.token, response.data.user)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      {/* Animated scan lines background */}
      <div className="scan-lines"></div>
      <div className="grid-overlay"></div>

      {/* Vignette effect */}
      <div className="vignette"></div>

      <div className={`login-terminal ${mounted ? 'mounted' : ''}`}>
        {/* Terminal chrome */}
        <div className="terminal-chrome">
          <div className="chrome-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="chrome-title">
            <Terminal size={12} />
            <span>secure_auth.sh</span>
          </div>
          <div className="chrome-status">
            <Lock size={10} />
          </div>
        </div>

        {/* Terminal header */}
        <div className="terminal-header">
          <div className="header-line">
            <ChevronRight size={14} strokeWidth={1.5} />
            <span className="typing-text">wallpaper archive v2.0</span>
          </div>
          <div className="header-line delay-1">
            <ChevronRight size={14} strokeWidth={1.5} />
            <span className="typing-text">admin authentication required</span>
          </div>
          <div className="header-line delay-2">
            <ChevronRight size={14} strokeWidth={1.5} />
            <span className="typing-text dim">enter credentials to proceed</span>
          </div>
        </div>

        {/* Authentication form */}
        <form onSubmit={handleSubmit} className="terminal-form">
          <div className={`terminal-input-group ${focusedInput === 'username' ? 'focused' : ''}`}>
            <div className="input-prompt">
              <ChevronRight size={14} strokeWidth={2} />
              <label htmlFor="username">user:</label>
            </div>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocusedInput('username')}
              onBlur={() => setFocusedInput(null)}
              required
              autoFocus
              autoComplete="username"
              spellCheck="false"
            />
            <div className="cursor-blink"></div>
          </div>

          <div className={`terminal-input-group ${focusedInput === 'password' ? 'focused' : ''}`}>
            <div className="input-prompt">
              <ChevronRight size={14} strokeWidth={2} />
              <label htmlFor="password">pass:</label>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedInput('password')}
              onBlur={() => setFocusedInput(null)}
              required
              autoComplete="current-password"
              spellCheck="false"
            />
            <div className="cursor-blink"></div>
          </div>

          {error && (
            <div className="terminal-error">
              <ChevronRight size={14} strokeWidth={2} />
              <span className="error-text">error: {error}</span>
            </div>
          )}

          <div className="terminal-actions">
            <button
              type="submit"
              className="terminal-submit"
              disabled={loading}
            >
              <ChevronRight size={14} strokeWidth={2} />
              <span>{loading ? 'authenticating' : 'execute'}</span>
              {loading && <span className="loading-dots">...</span>}
            </button>
          </div>
        </form>

        {/* Footer info */}
        <div className="terminal-footer">
          <div className="footer-line">
            <span className="dim">secure connection established</span>
            <span className="status-indicator"></span>
          </div>
        </div>
      </div>
    </div>
  )
}
