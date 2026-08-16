import { useState } from "react";
import { colors, caseStatusColors, caseStatusLabels, bgSoft } from "../../theme/tokens";

export interface CaseListItem {
  id: string;
  title: string;
  village: string;
  timeAgo: string;
  status: "menunggu" | "dalam_proses" | "perlu_tindakan" | "diterima" | "ditolak";
  reportCount: number;
  priorityDot?: "teal" | "amber" | "blue";
}

export interface CaseListRailProps {
  items?: CaseListItem[];
  onCaseClick?: (id: string) => void;
}

function getPriorityDotColor(dot?: "teal" | "amber" | "blue"): string {
  switch (dot) {
    case "teal":
      return colors.primary;
    case "amber":
      return "#FBBF24";
    case "blue":
      return "#3B82F6";
    default:
      return colors.textMuted;
  }
}

export function CaseListRail({ items = [], onCaseClick }: CaseListRailProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = items.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.village.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      style={{
        width: 400,
        height: "100%",
        backgroundColor: "white",
        borderLeft: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kasus..."
            style={{
              width: "100%",
              height: 38,
              paddingLeft: 38,
              paddingRight: 12,
              fontSize: 13,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              outline: "none",
              backgroundColor: bgSoft,
              color: colors.textPrimary,
            }}
          />
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 16,
              color: colors.textMuted,
            }}
          >
            🔍
          </span>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
        }}
      >
        {filteredItems.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              color: colors.textMuted,
              fontSize: 13,
            }}
          >
            <span style={{ fontSize: 32, marginBottom: 8 }}>📋</span>
            <span>Tidak ada kasus</span>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onCaseClick?.(item.id)}
              style={{
                padding: "12px",
                marginBottom: 8,
                backgroundColor: "white",
                border: `1px solid ${colors.border}`,
                borderRadius: 11,
                cursor: onCaseClick ? "pointer" : "default",
                transition: "border-color 200ms, box-shadow 200ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.primary;
                e.currentTarget.style.boxShadow = `0 2px 8px ${colors.primary}20`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: getPriorityDotColor(item.priorityDot) + "15",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: getPriorityDotColor(item.priorityDot),
                    }}
                  />
                </div>

                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: colors.textPrimary,
                    lineHeight: 1.35,
                    flex: 1,
                  }}
                >
                  {item.title}
                </span>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: colors.textTertiary,
                  marginBottom: 4,
                }}
              >
                {item.village}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    backgroundColor: (caseStatusColors[item.status] || "#6B7280") + "20",
                    color: caseStatusColors[item.status] || "#6B7280",
                  }}
                >
                  {caseStatusLabels[item.status] || item.status}
                </span>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: colors.textMuted,
                    }}
                  >
                    {item.timeAgo}
                  </span>

                  <span
                    style={{
                      fontSize: 11,
                      color: colors.textTertiary,
                    }}
                  >
                    {item.reportCount} laporan
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
