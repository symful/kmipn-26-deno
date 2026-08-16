import { colors, caseStatusColors } from "../../theme/tokens";

export interface TimelineEvent {
  time: string;
  description: string;
  dotColor: "amber" | "teal" | "gray";
}

interface TimelineRailProps {
  events: TimelineEvent[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function TimelineRailLoadingState() {
  return (
    <div
      className="flex flex-col gap-3 w-[340px] flex-shrink-0"
      role="region"
      aria-label="Memuat timeline"
    >
      <div className="px-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: colors.textSecondary }}
        >
          Timeline &amp; keputusan
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
                style={{ backgroundColor: colors.border }}
                aria-hidden="true"
              />
              <span
                className="w-px flex-1 my-1 animate-pulse"
                style={{ backgroundColor: colors.border }}
                aria-hidden="true"
              />
            </div>
            <div className="flex flex-col gap-0.5 pb-4 min-w-0">
              <span
                className="text-xs font-mono animate-pulse"
                style={{ color: colors.border, width: 60 }}
              >
                &nbsp;
              </span>
              <span
                className="text-sm leading-snug animate-pulse"
                style={{ color: colors.border, width: "80%" }}
              >
                &nbsp;
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimelineRailEmptyState() {
  return (
    <div
      className="flex flex-col gap-3 w-[340px] flex-shrink-0"
      role="region"
      aria-label="Timeline kosong"
    >
      <div className="px-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: colors.textSecondary }}
        >
          Timeline &amp; keputusan
        </span>
      </div>
      <div className="flex items-center justify-center py-8">
        <p className="text-sm" style={{ color: colors.textMuted }}>
          Tidak ada timeline
        </p>
      </div>
    </div>
  );
}

export function TimelineRailErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 w-[340px] flex-shrink-0"
      role="alert"
      aria-label="Error timeline"
    >
      <div className="px-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: colors.textSecondary }}
        >
          Timeline &amp; keputusan
        </span>
      </div>
      <div
        className="flex flex-col items-center justify-center gap-3 py-6 px-4 rounded-lg"
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
      >
        <p className="text-sm text-center" style={{ color: colors.perluTindakan }}>
          {error || "Gagal memuat timeline"}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: colors.primary, color: "white" }}
          >
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
}

const DOT_COLORS = {
  amber: caseStatusColors.menunggu,
  teal: colors.primary,
  gray: caseStatusColors.ditolak,
} as const;

function TimelineDot({ color }: { color: "amber" | "teal" | "gray" }) {
  const bgColor = DOT_COLORS[color];
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: bgColor }}
      aria-hidden="true"
    />
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center pt-1">
        <TimelineDot color={event.dotColor} />
        <span
          className="w-px flex-1 my-1"
          style={{ backgroundColor: colors.border }}
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col gap-0.5 pb-4 min-w-0">
        <span
          className="text-xs font-mono"
          style={{ color: colors.textMuted }}
        >
          {event.time}
        </span>
        <span
          className="text-sm text-sigap-textPrimary leading-snug"
        >
          {event.description}
        </span>
      </div>
    </div>
  );
}

export function TimelineRail({ events, loading, error, onRetry }: TimelineRailProps) {
  if (loading) {
    return <TimelineRailLoadingState />;
  }

  if (error) {
    return <TimelineRailErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  }

  if (!events || events.length === 0) {
    return <TimelineRailEmptyState />;
  }

  return (
    <div
      className="flex flex-col gap-3 w-[340px] flex-shrink-0"
      role="region"
      aria-label="Timeline dan keputusan"
    >
      <div className="px-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: colors.textSecondary }}
        >
          Timeline &amp; keputusan
        </span>
      </div>

      <div className="flex flex-col">
        {events.map((event, index) => (
          <TimelineItem key={index} event={event} />
        ))}
      </div>
    </div>
  );
}
