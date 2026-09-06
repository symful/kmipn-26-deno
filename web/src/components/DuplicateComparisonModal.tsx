import { useState, type CSSProperties } from "react";
import { Modal } from "./design-system/Modal";
import {
  colors,
  fontFamilies,
  fontSizes,
  fontWeights,
  radius,
  spacing,
} from "../theme/tokens";
import type { DuplicateCandidate } from "../types";

interface DuplicateComparisonModalProps {
  original: DuplicateCandidate;
  duplicate: DuplicateCandidate;
  onMerge: (targetId: string) => void;
  onClose: () => void;
  open?: boolean;
}

const lineHeights = {
  "125": "1.25",
  "130": "1.3",
  "135": "1.35",
  "140": "1.4",
  "145": "1.45",
  "155": "1.55",
} as const;

const colStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: spacing["6"],
  padding: spacing.md,
};

const dividerVerticalStyle: CSSProperties = {
  width: 1,
  backgroundColor: colors.borderCard,
  alignSelf: "stretch",
  margin: `${spacing["8"]} 0`,
};

const labelStyle: CSSProperties = {
  fontFamily: fontFamilies.sans,
  fontSize: fontSizes["10"],
  fontWeight: fontWeights.medium,
  color: colors.textMuted,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  marginBottom: 2,
};

const valueStyle: CSSProperties = {
  fontFamily: fontFamilies.mono,
  fontSize: fontSizes["12"],
  color: colors.textPrimary,
  lineHeight: lineHeights["145"],
};

const photoStyle: CSSProperties = {
  width: "100%",
  maxHeight: 160,
  objectFit: "cover",
  borderRadius: radius.sm,
  border: `1px solid ${colors.borderCard}`,
  backgroundColor: colors.bgSurface,
};

const headerColumnLabel: CSSProperties = {
  fontFamily: fontFamilies.sans,
  fontSize: fontSizes["12"],
  fontWeight: fontWeights.semibold,
  color: colors.textPrimary,
  lineHeight: lineHeights["135"],
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: spacing["8"],
  padding: `${spacing["8"]} ${spacing.md}`,
  borderTop: `1px solid ${colors.borderCard}`,
  backgroundColor: colors.bgSurface,
};

export const DuplicateComparisonModal = ({
  original,
  duplicate,
  onMerge,
  onClose,
  open = true,
}: DuplicateComparisonModalProps) => {
  const [mergeHovered, setMergeHovered] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="wide">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            padding: `${spacing.md} ${spacing.md} ${spacing["8"]}`,
          }}
        >
          <div style={{ ...colStyle, alignItems: "flex-start" }}>
            <span style={headerColumnLabel}>Laporan yang sedang ditinjau</span>
          </div>
          <div style={dividerVerticalStyle} />
          <div style={{ ...colStyle, alignItems: "flex-start" }}>
            <span style={headerColumnLabel}>Laporan pembanding</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            borderTop: `1px solid ${colors.borderCard}`,
            borderBottom: `1px solid ${colors.borderCard}`,
          }}
        >
          <div style={colStyle}>
            <div>
              <div style={labelStyle}>Foto</div>
              {(original as DuplicateCandidate & { photo_url?: string })
                .photo_url ? (
                <img
                  src={
                    (original as DuplicateCandidate & { photo_url?: string })
                      .photo_url
                  }
                  alt="Laporan asli"
                  style={photoStyle}
                />
              ) : (
                <div
                  style={{
                    ...photoStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: fontFamilies.sans,
                    fontSize: fontSizes["12"],
                    color: colors.textMuted,
                  }}
                >
                  Tidak ada foto
                </div>
              )}
            </div>

            <div>
              <div style={labelStyle}>Nomor laporan</div>
              <div style={valueStyle}>{original.report_id}</div>
            </div>

            <div>
              <div style={labelStyle}>Tanggal</div>
              <div style={valueStyle}>{formatDate(original.created_at)}</div>
            </div>

            <div>
              <div style={labelStyle}>Deskripsi</div>
              <div
                style={{
                  ...valueStyle,
                  fontSize: fontSizes["12"],
                  color: colors.textSecondary,
                  lineHeight: lineHeights["145"],
                }}
              >
                {original.description || "Tidak ada deskripsi"}
              </div>
            </div>
          </div>

          <div style={dividerVerticalStyle} />

          <div style={colStyle}>
            <div>
              <div style={labelStyle}>Foto</div>
              {(duplicate as DuplicateCandidate & { photo_url?: string })
                .photo_url ? (
                <img
                  src={
                    (duplicate as DuplicateCandidate & { photo_url?: string })
                      .photo_url
                  }
                  alt="Laporan duplikat"
                  style={photoStyle}
                />
              ) : (
                <div
                  style={{
                    ...photoStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: fontFamilies.sans,
                    fontSize: fontSizes["12"],
                    color: colors.textMuted,
                  }}
                >
                  Tidak ada foto
                </div>
              )}
            </div>

            <div>
              <div style={labelStyle}>Nomor laporan</div>
              <div style={valueStyle}>{duplicate.report_id}</div>
            </div>

            <div>
              <div style={labelStyle}>Tanggal</div>
              <div style={valueStyle}>{formatDate(duplicate.created_at)}</div>
            </div>

            <div>
              <div style={labelStyle}>Deskripsi</div>
              <div
                style={{
                  ...valueStyle,
                  fontSize: fontSizes["12"],
                  color: colors.textSecondary,
                  lineHeight: lineHeights["145"],
                }}
              >
                {duplicate.description || "Tidak ada deskripsi"}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing["13"],
            padding: spacing.md,
          }}
        >
          <div
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: fontSizes["12"],
              color: colors.textTertiary,
            }}
          >
            Jarak: {original.distance_m}m
          </div>
          {original.similarity_score != null && (
            <div
              style={{
                fontFamily: fontFamilies.mono,
                fontSize: fontSizes["12"],
                color: colors.textTertiary,
              }}
            >
              Kemiripan: {Math.round(original.similarity_score * 100)}%
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: `${spacing["4"]} ${spacing["13"]}`,
              borderRadius: radius.btn,
              fontFamily: fontFamilies.sans,
              fontSize: fontSizes["12"],
              fontWeight: fontWeights.medium,
              color: "#ffffff",
              backgroundColor: mergeHovered
                ? colors.primaryHover
                : colors.primary,
              border: `1px solid ${colors.primaryHover}`,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={() => setMergeHovered(true)}
            onMouseLeave={() => setMergeHovered(false)}
            onClick={() => onMerge(original.report_id)}
          >
            Gabungkan ke Kasus Ini
          </button>
          <button
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: `${spacing["4"]} ${spacing["13"]}`,
              borderRadius: radius.btn,
              fontFamily: fontFamilies.sans,
              fontSize: fontSizes["12"],
              fontWeight: fontWeights.medium,
              color: cancelHovered ? colors.textPrimary : colors.textSecondary,
              backgroundColor: cancelHovered ? colors.bgSurface : "transparent",
              border: `1px solid ${colors.borderCard}`,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={() => setCancelHovered(true)}
            onMouseLeave={() => setCancelHovered(false)}
            onClick={onClose}
          >
            Batal
          </button>
        </div>
      </div>
    </Modal>
  );
};
