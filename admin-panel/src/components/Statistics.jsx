import { BarChart3, FolderOpen, Monitor, HardDrive } from "lucide-react";
import { useEffect } from "react";
import { useAdminData } from "../context/useAdminData";

function Statistics() {
  const { stats, fetchStats, statsLoading, errors } = useAdminData();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const StatRow = ({ label, count, maxCount, color }) => {
    const percentage = Math.round((count / maxCount) * 100);

    return (
      <div className="stat-row">
        <div className="stat-row__header">
          <span className="stat-row__label" title={label}>
            {label}
          </span>
          <span className="stat-row__count">{count.toLocaleString()}</span>
        </div>
        <div className="stat-row__bar-bg">
          <div
            className={`stat-bar stat-bar--${color}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

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
    .slice(0, 12)
    .map((item) => ({
      folder: item.folder,
      count: item.count,
    }));

  const resolutionStats = Object.entries(stats?.dimensions || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([resolution, count]) => ({ resolution, count }));

  const buckets = stats?.file_size_buckets || {};
  const fileSizeStats = [
    { range: "< 1MB", count: buckets.under_1mb || 0 },
    { range: "1-5MB", count: buckets.between_1_5mb || 0 },
    { range: "5-10MB", count: buckets.between_5_10mb || 0 },
    { range: "> 10MB", count: buckets.over_10mb || 0 },
  ];
  const maxFileSize = Math.max(1, ...fileSizeStats.map((s) => s.count));
  const topProviderCount = providerStats[0]?.count || 1;
  const topFolderCount = folderStats[0]?.count || 1;
  const topResolutionCount = resolutionStats[0]?.count || 1;

  return (
    <div className="statistics">
      {/* Summary Stats */}
      <div className="stat-card summary-card">
        <h3>Collection Summary</h3>
        <div className="collection-summary">
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--blue">
              {(stats?.total_wallpapers || 0).toLocaleString()}
            </div>
            <div className="summary-item__label">Total Wallpapers</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--green">
              {stats?.providers || 0}
            </div>
            <div className="summary-item__label">Providers</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--red">
              {stats?.folders || 0}
            </div>
            <div className="summary-item__label">Folders</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-item__value summary-item__value--orange">
              {((stats?.storage_size || 0) / (1000 * 1000 * 1000)).toFixed(1)}GB
            </div>
            <div className="summary-item__label">Storage</div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {/* Provider Distribution */}
        <div className="stat-card stat-card--scrollable">
          <h3>
            <BarChart3 size={14} />
            Wallpapers by Provider
          </h3>
          <div>
            {providerStats.map(({ provider, count }) => (
              <StatRow 
                key={provider}
                label={provider}
                count={count}
                maxCount={topProviderCount}
                color="blue"
              />
            ))}
          </div>
        </div>

        {/* Top Folders */}
        <div className="stat-card stat-card--scrollable">
          <h3>
            <FolderOpen size={14} />
            Top Categories
          </h3>
          <div>
            {folderStats.map(({ folder, count }) => (
              <StatRow 
                key={folder}
                label={folder}
                count={count}
                maxCount={topFolderCount}
                color="green"
              />
            ))}
          </div>
        </div>

        {/* Resolution Distribution */}
        <div className="stat-card stat-card--scrollable">
          <h3>
            <Monitor size={14} />
            Common Resolutions
          </h3>
          <div>
            {resolutionStats.map(({ resolution, count }) => (
              <StatRow 
                key={resolution}
                label={resolution}
                count={count}
                maxCount={topResolutionCount}
                color="red"
              />
            ))}
          </div>
        </div>

        {/* File Size Distribution */}
        <div className="stat-card">
          <h3>
            <HardDrive size={14} />
            File Size Distribution
          </h3>
          <div>
            {fileSizeStats.map(({ range, count }) => (
              <StatRow 
                key={range}
                label={range}
                count={count}
                maxCount={maxFileSize}
                color="orange"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Statistics;
