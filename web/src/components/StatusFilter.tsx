import type { ReportStatus } from "../types";
import { ALL_STATUSES } from "../lib/report-statuses";

interface StatusFilterProps {
  value: ReportStatus | "";
  onChange: (status: ReportStatus | "") => void;
}

export const StatusFilter = ({ value, onChange }: StatusFilterProps) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {ALL_STATUSES.map((s) => (
        <button
          key={s.value}
          onClick={() => onChange(s.value)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            value === s.value
              ? "bg-sigap-primary text-white"
              : "bg-sigap-surface text-sigap-textSecondary border border-sigap-border hover:bg-sigap-border"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
};
