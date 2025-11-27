// Dynamic API base URL that works for both local and network access
export const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : ''

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
