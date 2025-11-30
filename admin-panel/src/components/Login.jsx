import { useState } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
        // Store token in localStorage
        localStorage.setItem('admin_token', response.data.token)
        localStorage.setItem('admin_user', JSON.stringify(response.data.user))

        // Notify parent component
        onLoginSuccess(response.data.token, response.data.user)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      fontFamily: '"SF Mono", Monaco, monospace'
    }}>
      <div style={{
        background: '#111',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '2rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}>
        <h1 style={{
          color: '#fff',
          fontSize: '1.5rem',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          Admin Login
        </h1>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              color: '#aaa',
              marginBottom: '0.5rem',
              fontSize: '0.875rem'
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.875rem',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              color: '#aaa',
              marginBottom: '0.5rem',
              fontSize: '0.875rem'
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.875rem',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#2a0a0a',
              border: '1px solid #ff4444',
              borderRadius: '4px',
              padding: '0.75rem',
              marginBottom: '1rem',
              color: '#ff6666',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: loading ? '#333' : '#007AFF',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loading) e.target.style.background = '#0066dd'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.target.style.background = '#007AFF'
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
