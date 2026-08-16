import { colors } from "../../theme/tokens";
import { caseStatusColors } from "../../theme/tokens";

interface ScoreBar {
  label: string;
  value: number;
}

interface ScorePanelProps {
  score: number;
  maxScore?: number;
  confidenceLabel?: string;
  modelVersion?: string;
  bars: ScoreBar[];
  onOverrideBeralasan?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ScorePanelLoadingState() {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-4"
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div className="flex items-end gap-2">
        <span
          className="font-bold leading-none animate-pulse"
          style={{ fontSize: 48, color: colors.border, width: 80 }}
        >
          &nbsp;
        </span>
        <span
          className="leading-none pb-1 animate-pulse"
          style={{ fontSize: 20, color: colors.border }}
        >
          /100
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold animate-pulse"
          style={{ backgroundColor: colors.border + "40", color: colors.border, width: 100 }}
        >
          &nbsp;
        </span>
        <span
          className="text-xs animate-pulse"
          style={{ color: colors.border }}
        >
          &nbsp;
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="text-xs w-36 shrink-0 animate-pulse"
              style={{ color: colors.border }}
            >
              &nbsp;
            </span>
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-neutral-200">
              <div
                className="h-full rounded-full animate-pulse"
                style={{
                  width: "60%",
                  backgroundColor: colors.border,
                }}
              />
            </div>
            <span
              className="text-xs font-semibold w-8 text-right shrink-0 animate-pulse"
              style={{ color: colors.border }}
            >
              &nbsp;
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScorePanelEmptyState() {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-4"
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div className="flex items-center justify-center py-4">
        <p className="text-sm" style={{ color: colors.textMuted }}>
          Tidak ada data skor
        </p>
      </div>
    </div>
  );
}

export function ScorePanelErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-4"
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        className="flex flex-col items-center justify-center gap-3 py-6 px-4 rounded-lg"
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
      >
        <p className="text-sm text-center" style={{ color: colors.perluTindakan }}>
          {error || "Gagal memuat skor"}
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

export function ScorePanel({
  score,
  maxScore = 100,
  confidenceLabel = "Confidence tinggi",
  modelVersion = "model v2.3",
  bars,
  onOverrideBeralasan,
  loading,
  error,
  onRetry,
}: ScorePanelProps) {
  if (loading) {
    return <ScorePanelLoadingState />;
  }

  if (error) {
    return <ScorePanelErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  }

  if (bars.length === 0) {
    return <ScorePanelEmptyState />;
  }

  const tealColor = colors.primary;
  const greenColor = caseStatusColors.diterima;

  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-4"
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div className="flex items-end gap-2">
        <span
          className="font-bold leading-none"
          style={{ fontSize: 48, color: colors.textPrimary }}
        >
          {score}
        </span>
        <span
          className="leading-none pb-1"
          style={{ fontSize: 20, color: colors.textTertiary }}
        >
          /{maxScore}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: greenColor + "20", color: greenColor }}
        >
          {confidenceLabel}
        </span>
        <span
          className="text-xs"
          style={{ color: colors.textMuted }}
        >
          {modelVersion}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2">
            <span
              className="text-xs w-36 shrink-0"
              style={{ color: colors.textSecondary }}
            >
              {bar.label}
            </span>
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-neutral-200">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(bar.value / maxScore) * 100}%`,
                  backgroundColor: tealColor,
                }}
              />
            </div>
            <span
              className="text-xs font-semibold w-8 text-right shrink-0"
              style={{ color: tealColor }}
            >
              +{bar.value}
            </span>
          </div>
        ))}
      </div>

      {onOverrideBeralasan && (
        <button
          type="button"
          onClick={onOverrideBeralasan}
          className="text-left text-xs font-semibold hover:underline"
          style={{ color: colors.primary }}
        >
          Override beralasan
        </button>
      )}
    </div>
  );
}
