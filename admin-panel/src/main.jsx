import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AdminDataProvider } from './context/AdminDataContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AdminDataProvider>
        <App />
      </AdminDataProvider>
    </AuthProvider>
  </StrictMode>,
)
