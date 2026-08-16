import { colors } from "../../theme/tokens";

interface StatusBadgeGroupProps {
  location: string;
  supportingReportCount: number;
  slaMinutesOverdue?: number;
}

type BadgeStyle = "warning" | "critical";

interface BadgeConfig {
  label: string;
  style: BadgeStyle;
}

const BADGE_COLORS: Record<BadgeStyle, { bg: string; text: string }> = {
  warning: { bg: "#FEBC2E20", text: "#B8730A" },
  critical: { bg: "#C0392B20", text: "#C0392B" },
};

function Badge({ label, style }: BadgeConfig) {
  const { bg, text } = BADGE_COLORS[style];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

function SlaBadge({ minutesOverdue }: { minutesOverdue: number }) {
  const MINUTES_PER_HOUR = 60;
  const hours = Math.ceil(minutesOverdue / MINUTES_PER_HOUR);
  const label = hours >= 1
    ? `SLA terlewat ${hours}j`
    : `SLA terlewat ${minutesOverdue}m`;
  const { bg, text } = BADGE_COLORS.critical;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

export function StatusBadgeGroup({
  location,
  supportingReportCount,
  slaMinutesOverdue,
}: StatusBadgeGroupProps) {
  const badges: BadgeConfig[] = [
    { label: "Menunggu verifikasi", style: "warning" },
    { label: "Prioritas tinggi", style: "critical" },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {badges.map((badge) => (
          <Badge key={badge.label} {...badge} />
        ))}
        {slaMinutesOverdue !== undefined && slaMinutesOverdue > 0 && (
          <SlaBadge minutesOverdue={slaMinutesOverdue} />
        )}
      </div>
      <p className="text-xs" style={{ color: colors.textTertiary }}>
        {location} · {supportingReportCount} laporan pendukung
      </p>
    </div>
  );
}
