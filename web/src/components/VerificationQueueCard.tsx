import { AssessmentSummary } from "./AssessmentResultDetails";
import { useState, type CSSProperties } from "react";
import type { Facility, AgentAssessment } from "../types";
import { SigapCard } from "./design-system/Card";
import {
  colors,
  fontFamilies,
  fontSizes,
  fontWeights,
  radius,
  spacing,
} from "../theme/tokens";

interface VerificationQueueCardProps {
  facility: Facility;
  assessments: AgentAssessment[];
  photoUrls?: string[];
  onAction: (action: string, facilityId: string) => void;
}

const lineHeights = {
  "125": "1.25",
  "130": "1.3",
  "135": "1.35",
  "140": "1.4",
  "145": "1.45",
  "155": "1.55",
} as const;

const extendedColorsDangerText = "#a5271a";

const photoThumbStyle: CSSProperties = {
  width: 72,
  height: 54,
  objectFit: "cover",
  borderRadius: radius.sm,
  border: `1px solid ${colors.borderCard}`,
  backgroundColor: colors.bgSurface,
};

const categoryPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: `${spacing["2"]} ${spacing["6"]}`,
  borderRadius: radius.pill,
  backgroundColor: colors.categoryTagBg,
  color: colors.categoryTagText,
  fontFamily: fontFamilies.sans,
  fontSize: fontSizes["10"],
  fontWeight: fontWeights.medium,
  lineHeight: lineHeights["145"],
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
};

const actionButtonStyle = (
  variant: "primary" | "secondary" | "danger",
): CSSProperties => {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: `${spacing["4"]} ${spacing["8"]}`,
    borderRadius: radius.btn,
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes["12"],
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights["140"],
    border: "1px solid transparent",
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap" as const,
  };

  switch (variant) {
    case "primary":
      return {
        ...base,
        backgroundColor: colors.primary,
        color: "#ffffff",
        border: `1px solid ${colors.primaryHover}`,
      };
    case "danger":
      return {
        ...base,
        backgroundColor: colors.dangerBg,
        color: extendedColorsDangerText,
        border: `1px solid ${extendedColorsDangerText}20`,
      };
    default:
      return {
        ...base,
        backgroundColor: colors.bgSurface,
        color: colors.textSecondary,
        border: `1px solid ${colors.borderCard}`,
      };
  }
};

export const VerificationQueueCard = ({
  facility,
  assessments,
  photoUrls = [],
  onAction,
}: VerificationQueueCardProps) => {
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const catLabel = facility.category_name ?? "Umum";

  return (
    <SigapCard padding={0} style={{ overflow: "hidden" as const }}>
      <div
        style={{
          padding: `${spacing["8"]} ${spacing.md}`,
          paddingBottom: spacing["6"],
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: spacing["6"],
          }}
        >
          <h3
            style={{
              fontFamily: fontFamilies.sans,
              fontSize: fontSizes["14"],
              fontWeight: fontWeights.semibold,
              color: colors.textPrimary,
              margin: 0,
              lineHeight: lineHeights["135"],
              flex: 1,
              marginRight: spacing["8"],
            }}
          >
            {facility.canonical_name}
          </h3>
          <span style={categoryPillStyle}>{catLabel}</span>
        </div>

        {photoUrls.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: spacing["4"],
              marginBottom: spacing["8"],
            }}
          >
            {photoUrls.slice(0, 3).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Bukti ${i + 1}`}
                style={photoThumbStyle}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ))}
            {photoUrls.length > 3 && (
              <div
                style={{
                  width: 72,
                  height: 54,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.borderCard}`,
                  backgroundColor: colors.bgSurface,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: fontFamilies.mono,
                  fontSize: fontSizes["10"],
                  color: colors.textMuted,
                }}
              >
                +{photoUrls.length - 3}
              </div>
            )}
          </div>
        )}

        <AssessmentSummary assessments={assessments} />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: spacing["4"],
          }}
        >
          <button
            style={{
              ...actionButtonStyle("primary"),
              ...(hoveredBtn === "setujui"
                ? { opacity: 0.85, transform: "translateY(-1px)" }
                : {}),
            }}
            onMouseEnter={() => setHoveredBtn("setujui")}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => onAction("setujui", facility.id)}
          >
            Setujui
          </button>
          <button
            style={{
              ...actionButtonStyle("secondary"),
              ...(hoveredBtn === "gabungkan"
                ? { opacity: 0.85, transform: "translateY(-1px)" }
                : {}),
            }}
            onMouseEnter={() => setHoveredBtn("gabungkan")}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => onAction("gabungkan", facility.id)}
          >
            Gabungkan
          </button>
          <button
            style={{
              ...actionButtonStyle("secondary"),
              ...(hoveredBtn === "survei"
                ? { opacity: 0.85, transform: "translateY(-1px)" }
                : {}),
            }}
            onMouseEnter={() => setHoveredBtn("survei")}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => onAction("survei", facility.id)}
          >
            Survei
          </button>
          <button
            style={{
              ...actionButtonStyle("secondary"),
              ...(hoveredBtn === "minta_foto"
                ? { opacity: 0.85, transform: "translateY(-1px)" }
                : {}),
            }}
            onMouseEnter={() => setHoveredBtn("minta_foto")}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => onAction("minta_foto", facility.id)}
          >
            Minta Foto
          </button>
          <button
            style={{
              ...actionButtonStyle("danger"),
              ...(hoveredBtn === "tolak"
                ? { opacity: 0.85, transform: "translateY(-1px)" }
                : {}),
            }}
            onMouseEnter={() => setHoveredBtn("tolak")}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={() => onAction("tolak", facility.id)}
          >
            Tolak
          </button>
        </div>
      </div>
    </SigapCard>
  );
};
