import { colors } from "../../theme/tokens";

interface CaseHeaderProps {
  caseId: string;
  categoryName: string;
  title: string;
  onBreadcrumbClick?: () => void;
}

export function CaseHeader({
  caseId,
  categoryName,
  title,
  onBreadcrumbClick,
}: CaseHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onBreadcrumbClick}
        className="flex items-center gap-1 text-xs text-sigap-textTertiary hover:text-sigap-primary transition-colors w-fit"
      >
        <span>Peta &amp; Kasus</span>
        <span>/</span>
        <span className="font-mono">{caseId}</span>
      </button>

      <div className="flex flex-col gap-2">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold w-fit"
          style={{
            backgroundColor: colors.primary + "20",
            color: colors.primary,
          }}
        >
          {categoryName}
        </span>

        <h1 className="text-[20px] font-bold text-sigap-textPrimary leading-tight">
          {title}
        </h1>
      </div>
    </div>
  );
}
