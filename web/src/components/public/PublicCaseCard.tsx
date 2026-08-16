import { Link } from "react-router-dom";
import { colors } from "../../theme/tokens";
import { CaseStatusBadge } from "../operator/CaseStatusBadge";

function mapStatusToCaseStatus(status: string): "menunggu" | "dalam_proses" | "perlu_tindakan" | "diterima" | "ditolak" {
  switch (status) {
    case "submitted":
    case "needs_survey":
      return "menunggu";
    case "under_review":
    case "verified":
    case "in_progress":
      return "dalam_proses";
    case "resolved":
      return "diterima";
    case "rejected":
    case "duplicate_merged":
      return "ditolak";
    default:
      return "menunggu";
  }
}

function getPriorityColor(severity: number | null): string {
  if (severity === null) return colors.textMuted;
  if (severity >= 0.7) return colors.perluTindakan;
  if (severity >= 0.4) return "#FBBF24";
  return colors.primary;
}

function getPriorityLabel(severity: number | null): string {
  if (severity === null) return "Tidak ada";
  if (severity >= 0.7) return "Tinggi";
  if (severity >= 0.4) return "Sedang";
  return "Rendah";
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Baru saja";
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export interface PublicCaseCardData {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  categoryInitials: string;
  location: string;
  status: string;
  severity: number | null;
  createdAt: string;
  thumbnailUrl?: string | null;
}

export interface PublicCaseCardProps {
  case: PublicCaseCardData;
  onClick?: (id: string) => void;
}

export function PublicCaseCard({ case: c, onClick }: PublicCaseCardProps) {
  const handleClick = () => {
    onClick?.(c.id);
  };

  return (
    <Link
      to={`/public/cases/${c.id}`}
      onClick={handleClick}
      className="bg-white border border-[#e4e7e2] rounded-[13px] p-3.5 hover:border-[#0f7a6b] transition-colors flex gap-3"
    >
      <div className="w-[64px] h-[64px] rounded-[9px] bg-[#eef0ec] flex-shrink-0 overflow-hidden">
        {c.thumbnailUrl ? (
          <img
            src={c.thumbnailUrl}
            alt={c.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[#8a9099] text-xs font-mono">
              {c.categoryInitials}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
            style={{
              backgroundColor: colors.primary + "15",
              color: colors.primaryHover,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {c.categoryInitials}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium"
            style={{ color: getPriorityColor(c.severity) }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: getPriorityColor(c.severity) }}
            />
            {getPriorityLabel(c.severity)}
          </span>
        </div>

        <div className="text-[13px] font-semibold text-[#17191c] leading-[1.35] line-clamp-2 mb-1">
          {c.title}
        </div>

        <div className="text-[11px] text-[#616770] mb-1.5 truncate">
          {c.location}
        </div>

        <div className="flex items-center gap-2">
          <CaseStatusBadge status={mapStatusToCaseStatus(c.status)} />
          <span className="text-[11px] text-[#8a9099]">
            {getTimeAgo(c.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
