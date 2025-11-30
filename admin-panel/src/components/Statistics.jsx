import { useEffect } from "react";
import { useAdminData } from "../context/useAdminData";

function Statistics() {
  const { stats, fetchStats, statsLoading, errors } = useAdminData();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (statsLoading && !stats) {
    return <div className="loading">Loading statistics...</div>;
  }

  if (errors.stats) {
    return <div className="error">{errors.stats}</div>;
  }

  const providerStats = (stats?.providers_breakdown || []).map((item) => ({
    provider: item.provider,
    count: item.count,
  }));

  const folderStats = (stats?.folder_breakdown || [])
    .slice(0, 8)
    .map((item) => ({
      folder: item.folder,
      count: item.count,
    }));

  const resolutionStats = Object.entries(stats?.dimensions || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([resolution, count]) => ({ resolution, count }));

  const buckets = stats?.file_size_buckets || {};
  const fileSizeStats = [
    { range: "< 1MB", count: buckets.under_1mb || 0 },
    { range: "1-5MB", count: buckets.between_1_5mb || 0 },
    { range: "5-10MB", count: buckets.between_5_10mb || 0 },
    { range: "> 10MB", count: buckets.over_10mb || 0 },
  ];

  const topProviderCount = providerStats[0]?.count || 1;
  const topFolderCount = folderStats[0]?.count || 1;
  const topResolutionCount = resolutionStats[0]?.count || 1;
  const maxFileSize = Math.max(1, ...fileSizeStats.map((s) => s.count));

  const StatBar = ({ value, max, color }) => {
    const pct = Math.round((value / max) * 100);
    return (
      <div className="stat-bar-track">
        <div className={`stat-bar-fill stat-bar-fill--${color}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  return (
    <div className="statistics">
      {/* Summary Row */}
      <div className="stats-summary">
        <div className="stats-summary__item">
          <span className="stats-summary__value stats-summary__value--blue">
            {(stats?.total_wallpapers || 0).toLocaleString()}
          </span>
          <span className="stats-summary__label">Wallpapers</span>
        </div>
        <div className="stats-summary__item">
          <span className="stats-summary__value stats-summary__value--green">
            {stats?.providers || 0}
          </span>
          <span className="stats-summary__label">Providers</span>
        </div>
        <div className="stats-summary__item">
          <span className="stats-summary__value stats-summary__value--red">
            {stats?.folders || 0}
          </span>
          <span className="stats-summary__label">Folders</span>
        </div>
        <div className="stats-summary__item">
          <span className="stats-summary__value stats-summary__value--orange">
            {((stats?.storage_size || 0) / (1000 * 1000 * 1000)).toFixed(1)}GB
          </span>
          <span className="stats-summary__label">Storage</span>
        </div>
      </div>

      {/* Main Stats Table */}
      <div className="stats-table">
        {/* Providers Column */}
        <div className="stats-column">
          <h3 className="stats-column__title">Providers</h3>
          <div className="stats-list">
            {providerStats.map(({ provider, count }) => (
              <div key={provider} className="stats-list__row">
                <span className="stats-list__label">{provider}</span>
                <StatBar value={count} max={topProviderCount} color="blue" />
                <span className="stats-list__value">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Categories Column */}
        <div className="stats-column">
          <h3 className="stats-column__title">Top Categories</h3>
          <div className="stats-list">
            {folderStats.map(({ folder, count }) => (
              <div key={folder} className="stats-list__row">
                <span className="stats-list__label">{folder}</span>
                <StatBar value={count} max={topFolderCount} color="green" />
                <span className="stats-list__value">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Resolutions Column */}
        <div className="stats-column">
          <h3 className="stats-column__title">Resolutions</h3>
          <div className="stats-list">
            {resolutionStats.map(({ resolution, count }) => (
              <div key={resolution} className="stats-list__row">
                <span className="stats-list__label">{resolution}</span>
                <StatBar value={count} max={topResolutionCount} color="red" />
                <span className="stats-list__value">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* File Sizes Column */}
        <div className="stats-column">
          <h3 className="stats-column__title">File Sizes</h3>
          <div className="stats-list">
            {fileSizeStats.map(({ range, count }) => (
              <div key={range} className="stats-list__row">
                <span className="stats-list__label">{range}</span>
                <StatBar value={count} max={maxFileSize} color="orange" />
                <span className="stats-list__value">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Statistics;
