import { caseStatusColors, caseStatusLabels } from "../../theme/tokens";

type CaseStatus = "menunggu" | "dalam_proses" | "perlu_tindakan" | "diterima" | "ditolak";

interface CaseStatusBadgeProps {
  status: CaseStatus;
}

export function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  const color = caseStatusColors[status] ?? "#6B7280";
  const label = caseStatusLabels[status] ?? status;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: color + "20", color }}
    >
      {label}
    </span>
  );
}
