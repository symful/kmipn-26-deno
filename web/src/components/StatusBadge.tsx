import {
  statusStyle,
  statusLabel,
  colors,
  spacing,
  radius,
  fontWeights,
} from "../theme/tokens";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusBadgeProps {
  // Original API (status string → auto-computes style)
  status?: string;
  showDot?: boolean;
  // Design-system API (explicit tone + label)
  tone?: Tone;
  label?: string;
  dot?: boolean;
  size?: "sm" | "md";
}

const toneMap: Record<Tone, { bg: string; text: string; dot: string }> = {
  success: { bg: colors.successBg, text: colors.success, dot: colors.success },
  warning: { bg: colors.warningBg, text: colors.warning, dot: colors.warning },
  danger: { bg: colors.dangerBg, text: colors.danger, dot: colors.danger },
  info: { bg: colors.infoBg, text: colors.info, dot: colors.info },
  neutral: {
    bg: colors.bgSurface,
    text: colors.textTertiary,
    dot: colors.textTertiary,
  },
};

export const StatusBadge = ({
  status,
  showDot,
  tone,
  label,
  dot,
  size = "sm",
}: StatusBadgeProps) => {
  // Design-system API takes precedence if both are provided
  const isDesignSystem = tone !== undefined;

  const {
    bg,
    fg,
    dot: dotColor,
    computedLabel,
  } = isDesignSystem
    ? {
        bg: toneMap[tone].bg,
        fg: toneMap[tone].text,
        dot: toneMap[tone].dot,
        computedLabel: label ?? "",
      }
    : {
        bg: status ? statusStyle(status).bg : colors.bgSurface,
        fg: status ? statusStyle(status).fg : colors.textTertiary,
        dot: status ? statusStyle(status).dot : colors.textTertiary,
        computedLabel: status ? statusLabel(status) : "",
      };

  // showDot defaults to true for original API, dot defaults to true for design-system API
  const showDotFinal = isDesignSystem ? (dot ?? true) : (showDot ?? true);

  const padding = size === "sm" ? "4px 9px" : "5px 10px";
  const fontSize = size === "sm" ? "10px" : "12px";
  const dotSize = size === "sm" ? "6px" : "8px";

  return (
    <span
      role="status"
      aria-label={computedLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding,
        borderRadius: "20px",
        whiteSpace: "nowrap",
        backgroundColor: bg,
        color: fg,
        fontSize,
        fontWeight: fontWeights.semibold,
      }}
    >
      {showDotFinal && (
        <span
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
      {computedLabel}
    </span>
  );
};
