import React from "react";
import { colors, dangerBorder } from "../../theme/tokens";

export type QueueStatTrend = "up" | "down" | "neutral";

export interface QueueStatItem {
  label: string;
  value: number;
  trend?: QueueStatTrend | undefined;
  trendValue?: string | undefined;
  color?: string;
}

export interface QueueStatsRowProps {
  stats: QueueStatItem[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

// Skeleton stat card for loading state
function SkeletonStatCard() {
  return (
    <div
      className="flex-1 min-w-[180px] bg-white rounded-lg p-4 border border-sigap-border flex flex-col gap-3"
      style={{ borderColor: colors.border }}
    >
      <div
        className="w-10 h-10 rounded-lg animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
      <div
        className="h-8 w-20 rounded animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
      <div
        className="h-4 w-28 rounded animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
    </div>
  );
}

// Trend arrow icons
const TrendUpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9.5V2.5M6 2.5L2.5 6M6 2.5L9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const TrendDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 2.5V9.5M6 9.5L2.5 6M6 9.5L9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const NeutralIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 6H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// Queue icons for each stat type
const TotalAntreanIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const PerluTindakanIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const DalamProsesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const SelesaiIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const ICON_MAP: Record<string, React.ReactNode> = {
  "Total Antrean": <TotalAntreanIcon />,
  "Perlu Tindakan": <PerluTindakanIcon />,
  "Dalam Proses": <DalamProsesIcon />,
  "Selesai": <SelesaiIcon />,
};

const DEFAULT_COLORS: Record<string, string> = {
  "Total Antrean": colors.textPrimary,
  "Perlu Tindakan": colors.perluTindakan,
  "Dalam Proses": colors.diproses,
  "Selesai": colors.selesai,
};

const DEFAULT_TREND_COLORS: Record<QueueStatTrend, string> = {
  up: colors.selesai,
  down: colors.perluTindakan,
  neutral: colors.textMuted,
};

function getTrendIcon(trend: QueueStatTrend) {
  switch (trend) {
    case "up":
      return <TrendUpIcon />;
    case "down":
      return <TrendDownIcon />;
    default:
      return <NeutralIcon />;
  }
}

export function QueueStatsRow({
  stats,
  isLoading = false,
  isError = false,
  errorMessage = "Gagal memuat statistik",
  onRetry,
}: QueueStatsRowProps) {
  if (isLoading) {
    return (
      <div
        className="flex flex-row gap-4 w-full"
        style={{ overflowX: "auto" }}
      >
        {[1, 2, 3, 4].map((i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="flex flex-row gap-4 w-full"
        style={{ overflowX: "auto" }}
      >
        <div className="flex-1 min-w-[180px] bg-white rounded-lg p-4 border border-sigap-border flex flex-col gap-3 items-center justify-center" style={{ borderColor: colors.border }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: dangerBorder }}
          >
            <svg width="20" height="20" fill="none" stroke={colors.perluTindakan} strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm text-sigap-textSecondary text-center">{errorMessage}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 text-xs font-medium text-white rounded transition-colors"
              style={{ backgroundColor: colors.primary }}
            >
              Coba lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div
        className="flex flex-row gap-4 w-full"
        style={{ overflowX: "auto" }}
      >
        <div className="flex-1 min-w-[180px] bg-white rounded-lg p-4 border border-sigap-border flex flex-col gap-3 items-center justify-center" style={{ borderColor: colors.border }}>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: colors.surface }}
          >
            <svg width="20" height="20" fill="none" stroke={colors.textMuted} strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-sm text-sigap-textMuted text-center">Tidak ada data</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-row gap-4 w-full"
      style={{ overflowX: "auto" }}
    >
      {stats.map((stat) => {
        const iconColor = stat.color ?? DEFAULT_COLORS[stat.label] ?? colors.textPrimary;
        const trendColor = stat.trend
          ? DEFAULT_TREND_COLORS[stat.trend]
          : colors.textMuted;

        return (
          <div
            key={stat.label}
            className="flex-1 min-w-[180px] bg-white rounded-lg p-4 border border-sigap-border flex flex-col gap-3"
            style={{
              borderColor: colors.border,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `${iconColor}15`,
                color: iconColor,
              }}
            >
              {ICON_MAP[stat.label] ?? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
              )}
            </div>

            <div className="flex items-end gap-2">
              <span
                className="text-2xl font-bold tracking-tight"
                style={{ color: iconColor }}
              >
                {stat.value.toLocaleString("id-ID")}
              </span>
              {stat.trend && (
                <div
                  className="flex items-center gap-1 mb-1"
                  style={{ color: trendColor }}
                >
                  {getTrendIcon(stat.trend)}
                  {stat.trendValue && (
                    <span className="text-xs font-medium">
                      {stat.trendValue}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="text-sm text-sigap-textTertiary">
              {stat.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
