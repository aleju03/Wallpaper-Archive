import { useEffect } from 'react'
import { useAdminData } from '../context/useAdminData'

function StatCardSkeleton() {
  return (
    <div className="stat-card stat-card--skeleton">
      <h3 className="skeleton-text skeleton-text--sm">&nbsp;</h3>
      <div className="value skeleton-text skeleton-text--lg">&nbsp;</div>
      <div className="change skeleton-text skeleton-text--xs">&nbsp;</div>
    </div>
  )
}

function ProviderChipSkeleton() {
  return (
    <div className="provider-chip provider-chip--skeleton">
      <span className="provider-chip__status skeleton-circle" />
      <span className="provider-chip__name skeleton-text">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      <span className="provider-chip__count skeleton-text">&nbsp;&nbsp;</span>
    </div>
  )
}

function Dashboard() {
  const { stats, fetchStats, providerMeta, fetchProviders, statsLoading, providersLoading, errors } = useAdminData()

  useEffect(() => {
    fetchStats()
    fetchProviders()
  }, [fetchStats, fetchProviders])

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div className="stats-grid">
          {statsLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : errors.stats ? (
            <div className="stat-card stat-card--error">
              <p>{errors.stats}</p>
            </div>
          ) : (
            <>
              <div className="stat-card">
                <h3>Total Wallpapers</h3>
                <div className="value">{stats?.total_wallpapers?.toLocaleString() || '0'}</div>
                <div className="change">Across all providers</div>
              </div>
              
              <div className="stat-card">
                <h3>Providers</h3>
                <div className="value">{stats?.providers || '0'}</div>
                <div className="change">Active sources</div>
              </div>
              
              <div className="stat-card">
                <h3>Categories</h3>
                <div className="value">{stats?.folders || '0'}</div>
                <div className="change">Different folders</div>
              </div>

              <div className="stat-card">
                <h3>Storage Size</h3>
                <div className="value">{((stats?.storage_size || 0) / (1000 * 1000 * 1000)).toFixed(2)}GB</div>
                <div className="change">R2 bucket total</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="provider-status-section">
        <h3>Providers</h3>
        <div className="provider-list">
          {providersLoading ? (
            <>
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
              <ProviderChipSkeleton />
            </>
          ) : errors.providers ? (
            <span className="error-text">{errors.providers}</span>
          ) : (
            providerMeta.map((provider, index) => (
              <div key={index} className="provider-chip">
                <span className={`provider-chip__status provider-chip__status--${provider.status}`} />
                <span className="provider-chip__name">{provider.name}</span>
                <span className="provider-chip__count">{provider.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
