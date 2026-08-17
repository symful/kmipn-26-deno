import { colors } from "../../theme/tokens";

interface CaseListItem {
  id: string;
  title: string;
  village: string;
  timeAgo: string;
  status: string;
  statusColor: string;
  statusBg: string;
  reportCount: number;
  initials: string;
}

interface CaseListRailProps {
  items: CaseListItem[];
  onCaseClick: (id: string) => void;
}

export const CaseListRail = ({ items, onCaseClick }: CaseListRailProps) => {
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 400,
        borderLeft: `1px solid ${colors.border}`,
        backgroundColor: colors.bgCard,
      }}
    >
      <div className="px-5 py-3.5 border-b" style={{ borderColor: colors.border }}>
        <div
          className="px-3 py-2 rounded-lg border text-xs"
          style={{
            backgroundColor: colors.bgSurface,
            borderColor: colors.border,
            color: colors.textMuted,
          }}
        >
          Cari wilayah atau fasilitas…
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3.5 flex flex-col gap-2.5">
        {items.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm" style={{ color: colors.textMuted }}>Tidak ada kasus</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onCaseClick(item.id)}
                className="w-full text-left rounded-xl border p-3.5 hover:opacity-90 transition-opacity cursor-pointer"
                style={{
                  backgroundColor: colors.bgCard,
                  borderColor: colors.border,
                  display: "flex",
                  gap: 11,
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center rounded-lg"
                  style={{
                    width: 38,
                    height: 38,
                    backgroundColor: colors.primaryLight,
                    color: colors.primaryDark,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {item.initials}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate"
                    style={{ fontSize: 13.5, fontWeight: 600, color: colors.textPrimary }}
                  >
                    {item.title}
                  </p>
                  <p
                    className="mt-0.5 truncate"
                    style={{ fontSize: 11.5, color: colors.textTertiary }}
                  >
                    {item.village} · {item.timeAgo}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: item.statusBg,
                        color: item.statusColor,
                      }}
                    >
                      {item.status}
                    </span>
                    {item.reportCount > 1 && (
                      <span
                        className="text-xs"
                        style={{ color: colors.textTertiary, alignSelf: "center" }}
                      >
                        {item.reportCount} laporan
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
