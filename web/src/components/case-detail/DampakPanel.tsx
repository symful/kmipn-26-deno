import { colors } from "../../theme/tokens";

interface DampakItem {
  text: string;
  color: string;
}

interface DampakPanelProps {
  items: DampakItem[];
  footerText?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const DEFAULT_ITEMS: DampakItem[] = [
  { text: "Akses terputus untuk ±2 dusun", color: colors.perluTindakan },
  { text: "Risiko keselamatan tinggi", color: colors.offlineDot },
  { text: "Layanan sekolah terganggu", color: colors.textTertiary },
];

export function DampakPanelLoadingState() {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {[1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-sm flex-shrink-0 animate-pulse"
              style={{ backgroundColor: colors.border }}
              aria-hidden="true"
            />
            <span
              className="text-sm animate-pulse"
              style={{ color: colors.border, width: "70%" }}
            >
              &nbsp;
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DampakPanelEmptyState() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center py-4">
        <p className="text-sm" style={{ color: colors.textMuted }}>
          Tidak ada data dampak
        </p>
      </div>
    </div>
  );
}

export function DampakPanelErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-col items-center justify-center gap-3 py-6 px-4 rounded-lg"
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
      >
        <p className="text-sm text-center" style={{ color: colors.perluTindakan }}>
          {error || "Gagal memuat data dampak"}
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

export function DampakPanel({
  items = DEFAULT_ITEMS,
  footerText = "Konsolidasi dari 8 laporan...",
  loading,
  error,
  onRetry,
}: DampakPanelProps) {
  if (loading) {
    return <DampakPanelLoadingState />;
  }

  if (error) {
    return <DampakPanelErrorState error={error} {...(onRetry ? { onRetry } : {})} />;
  }

  if (!items || items.length === 0) {
    return <DampakPanelEmptyState />;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="text-sm text-sigap-textPrimary">{item.text}</span>
          </li>
        ))}
      </ul>
      {footerText && (
        <p className="text-xs text-sigap-textMuted">{footerText}</p>
      )}
    </div>
  );
}
