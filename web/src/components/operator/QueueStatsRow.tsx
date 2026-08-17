export type QueueStatTrend = "up" | "down" | "neutral";

export interface QueueStatItem {
  label: string;
  value: number;
  trend?: QueueStatTrend | undefined;
  trendValue?: string | undefined;
  color: string;
}

interface QueueStatsRowProps {
  stats: QueueStatItem[];
}

export const QueueStatsRow = ({ stats }: QueueStatsRowProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <div key={i} className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-neutral-500 mb-1">{stat.label}</p>
              <p className="text-2xl font-bold" style={{ color: stat.color }}>
                {stat.value.toLocaleString("id-ID")}
              </p>
            </div>
            {stat.trend && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                stat.trend === "up" ? "bg-danger-100 text-danger-600" :
                stat.trend === "down" ? "bg-primary-100 text-primary-600" :
                "bg-neutral-100 text-neutral-600"
              }`}>
                {stat.trendValue ?? stat.trend}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
