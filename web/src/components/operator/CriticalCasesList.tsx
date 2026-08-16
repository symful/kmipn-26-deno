import { colors } from "../../theme/tokens";
import { dangerBorder } from "../../theme/tokens";

export interface CriticalCaseItem {
  id: string;
  title: string;
  caseCode: string;
  villageName: string;
  slaHoursRemaining: number;
  isOverdue: boolean;
}

export interface CriticalCasesListProps {
  cases: CriticalCaseItem[];
  onCaseClick?: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

function SkeletonCaseRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
      <div
        className="flex-1 h-4 rounded animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
      <div
        className="h-3 w-20 rounded animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
      <div
        className="h-3 w-24 rounded animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
      <div
        className="h-3 w-10 rounded animate-pulse"
        style={{ backgroundColor: colors.border }}
      />
    </div>
  );
}

function SlaCountdown({ hours, isOverdue }: { hours: number; isOverdue: boolean }) {
  const displayText = isOverdue
    ? `${Math.abs(hours)}j`
    : `${hours}j`;

  return (
    <span
      className="text-xs font-semibold tabular-nums"
      style={{
        color: isOverdue ? colors.perluTindakan : colors.textMuted,
      }}
    >
      {displayText}
    </span>
  );
}

function StatusDot({ isOverdue }: { isOverdue: boolean }) {
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{
        backgroundColor: isOverdue ? colors.perluTindakan : colors.offlineDot,
      }}
    />
  );
}

function CaseRow({
  item,
  onClick,
}: {
  item: CriticalCaseItem;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-sigap-surface rounded-lg transition-colors text-left"
    >
      <StatusDot isOverdue={item.isOverdue} />

      <span className="flex-1 text-sm font-medium text-sigap-textPrimary truncate">
        {item.title}
      </span>

      <span className="text-xs font-mono text-sigap-textTertiary flex-shrink-0">
        {item.caseCode}
      </span>

      <span className="text-xs text-sigap-textTertiary flex-shrink-0 max-w-[100px] truncate">
        {item.villageName}
      </span>

      <SlaCountdown hours={item.slaHoursRemaining} isOverdue={item.isOverdue} />
    </button>
  );
}

export function CriticalCasesList({
  cases,
  onCaseClick,
  isLoading = false,
  isError = false,
  errorMessage = "Gagal memuat kasus kritis",
  onRetry,
}: CriticalCasesListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCaseRow key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-3">
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
    );
  }

  const displayCases = cases.slice(0, 4);

  if (displayCases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: colors.surface }}
        >
          <svg width="20" height="20" fill="none" stroke={colors.textMuted} strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-sm text-sigap-textMuted text-center">Tidak ada data</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {displayCases.map((item) => (
        <CaseRow
          key={item.id}
          item={item}
          onClick={() => onCaseClick?.(item.id)}
        />
      ))}
    </div>
  );
}
