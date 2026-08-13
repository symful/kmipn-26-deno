import { Link } from "react-router-dom";
import type { Report } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ReportCardProps {
  report: Report;
}

export const ReportCard = ({ report }: ReportCardProps) => {
  return (
    <Link
      to={`/admin/cases/${report.id}`}
      className="block bg-white rounded-lg p-4 border border-sigap-border hover:border-sigap-primary transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-sigap-textPrimary truncate">
            {report.category?.name ?? report.category_id}
          </p>
          <p className="text-xs text-sigap-textTertiary mt-1">
            {new Date(report.created_at).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <StatusBadge status={report.status} />
      </div>
      {report.severity != null && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-xs text-sigap-textMuted">Severity:</span>
          <span className="text-xs font-medium text-sigap-textSecondary">
            {report.severity}%
          </span>
        </div>
      )}
    </Link>
  );
};
