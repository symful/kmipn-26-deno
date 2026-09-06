import { type ReactNode, type CSSProperties } from "react";
import { SigapCard } from "./Card";
import { colors, fontSizes, fontWeights, spacing } from "@/theme/tokens";

type EmptyStateProps = {
  /** The icon to display (e.g. an inbox or error icon as ReactNode). */
  icon: ReactNode;

  /** Primary text label for this empty state. */
  title: string;

  /** Optional secondary text beneath the title. */
  subtitle?: string;

  /** Optional action widget rendered below the subtitle (e.g. a button). */
  action?: ReactNode;

  /** Additional CSS class names to apply to the card. */
  className?: string;

  /** Additional inline styles to apply to the card. */
  style?: CSSProperties;
};

/**
 * EmptyState — canonical empty / no-data state widget for the SIGAP design system.
 *
 * Built with [SigapCard] as its container. Displays a large muted icon, bold
 * title, optional subtitle, and optional action button. Centered layout with
 * generous spacing following the SIGAP visual language.
 *
 * Accessibility:
 * - Uses `role="status"` so screen readers announce it as a status region.
 * - [Semantics] label combines title + subtitle so screen readers announce
 *   the full empty state.
 * - Action button has a minimum 48px height tap target and visible focus ring.
 * - No information is conveyed by color alone; icon + text + optional button
 *   provide redundant cues.
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  className,
  style,
}: EmptyStateProps) {
  const semanticsLabel = subtitle != null ? `${title}. ${subtitle}` : title;

  return (
    <div
      role="status"
      aria-label={semanticsLabel}
      className={className}
      style={style}
    >
      <SigapCard padding={0}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "50px 20px",
          }}
        >
          {/* Large muted icon */}
          <div
            style={{ color: colors.textMuted, fontSize: "64px", lineHeight: 1 }}
          >
            {icon}
          </div>

          {/* Spacing */}
          <div style={{ height: spacing.lg }} />

          {/* Title */}
          <span
            style={{
              fontSize: fontSizes["16"],
              fontWeight: fontWeights.semibold,
              color: colors.textMuted,
              lineHeight: 1.3,
            }}
          >
            {title}
          </span>

          {/* Optional subtitle */}
          {subtitle != null && (
            <>
              {/* Spacing */}
              <div style={{ height: spacing.sm }} />

              <span
                style={{
                  fontSize: fontSizes["12"],
                  fontWeight: fontWeights.regular,
                  color: colors.textMuted,
                  lineHeight: 1.45,
                }}
              >
                {subtitle}
              </span>
            </>
          )}

          {/* Optional action button — min 48px tap target */}
          {action != null && (
            <>
              {/* Spacing */}
              <div style={{ height: spacing.lg }} />

              <div
                style={{
                  minHeight: "48px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {action}
              </div>
            </>
          )}
        </div>
      </SigapCard>
    </div>
  );
}
