import { useMemo, useState, useCallback } from 'react'
import axios from 'axios'
import { API_BASE } from '../config'
import { AdminDataContext } from './adminDataContext'

export function AdminDataProvider({ children }) {
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [providers, setProviders] = useState([])
  const [providerMeta, setProviderMeta] = useState([])
  const [folders, setFolders] = useState([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [errors, setErrors] = useState({ stats: null, providers: null })

  const fetchStats = useCallback(async (force = false) => {
    if (stats && !force) return stats
    setStatsLoading(true)
    try {
      const response = await axios.get(`${API_BASE}/api/stats`)
      setStats(response.data)
      setErrors((prev) => ({ ...prev, stats: null }))
      return response.data
    } catch (error) {
      setErrors((prev) => ({ ...prev, stats: 'Failed to load stats' }))
      throw error
    } finally {
      setStatsLoading(false)
    }
  }, [stats])

  const fetchProviders = useCallback(async (force = false) => {
    if (providers.length && !force) {
      return { providers: providerMeta, folders }
    }
    setProvidersLoading(true)
    try {
      const response = await axios.get(`${API_BASE}/api/providers`)
      const providerData = response.data.providers || []
      const providerNames = providerData.map(p => typeof p === 'string' ? p : p.name)
      setProviders(providerNames)
      setProviderMeta(providerData)
      // Extract folder names from folder objects
      const folderData = response.data.folders || []
      const folderNames = folderData.map(f => typeof f === 'string' ? f : f.name)
      setFolders(folderNames)
      setErrors((prev) => ({ ...prev, providers: null }))
      return { providers: providerData, folders: folderNames }
    } catch (error) {
      setErrors((prev) => ({ ...prev, providers: 'Failed to load providers' }))
      throw error
    } finally {
      setProvidersLoading(false)
    }
  }, [providers, folders, providerMeta])

  const value = useMemo(() => ({
    stats,
    setStats,
    statsLoading,
    fetchStats,
    providers,
    providerMeta,
    providersLoading,
    folders,
    fetchProviders,
    errors
  }), [stats, statsLoading, fetchStats, providers, providerMeta, providersLoading, folders, fetchProviders, errors])

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  )
}
