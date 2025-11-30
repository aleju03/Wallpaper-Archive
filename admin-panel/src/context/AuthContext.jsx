import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for existing token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token')
    const savedUser = localStorage.getItem('admin_user')

    if (savedToken && savedUser) {
      // Verify token is still valid
      verifyToken(savedToken, JSON.parse(savedUser))
    } else {
      setLoading(false)
    }
  }, [])

  const verifyToken = async (tokenToVerify, userData) => {
    try {
      await axios.get(`${API_BASE}/api/auth/verify`, {
        headers: {
          Authorization: `Bearer ${tokenToVerify}`
        }
      })

      // Token is valid
      setToken(tokenToVerify)
      setUser(userData)
    } catch (err) {
      // Token is invalid, clear it
      logout()
    } finally {
      setLoading(false)
    }
  }

  const login = (newToken, newUser) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('admin_token', newToken)
    localStorage.setItem('admin_user', JSON.stringify(newUser))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
  }

  const getAuthHeaders = () => {
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  return (
    <AuthContext.Provider value={{
      token,
      user,
      loading,
      isAuthenticated: !!token,
      login,
      logout,
      getAuthHeaders
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
