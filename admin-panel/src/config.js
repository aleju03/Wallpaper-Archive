// Dynamic API base URL that works for both local and network access
// Use environment variable if set, otherwise fall back to dynamic detection
export const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : `http://${window.location.hostname}:3000`

// Helper function to get the current hostname
export const getCurrentHost = () => window.location.hostname

// Helper function to check if running locally
export const isLocalhost = () => window.location.hostname === 'localhost' 

// Normalize asset URLs so both absolute (R2) and relative (local) paths work
export const resolveAssetUrl = (url) => {
  if (!url) return ''
  return /^https?:\/\//i.test(url) || url.startsWith('//')
    ? url
    : `${API_BASE}${url}`
}

// Helper to get auth headers (token from localStorage)
// Note: Components should use useAuth().getAuthHeaders() instead
export const getAdminHeaders = () => {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
