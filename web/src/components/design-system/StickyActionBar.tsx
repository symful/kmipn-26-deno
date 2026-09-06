import { type ReactNode, type CSSProperties } from "react";
import { colors, spacing } from "@/theme/tokens";

type StickyActionBarProps = {
  children: ReactNode;
  className?: string;
  safeArea?: boolean;
};

/**
 * StickyActionBar — a sticky bottom action bar for the SIGAP design system.
 *
 * Stays pinned to the viewport bottom while content scrolls above it.
 * Background uses the surface token with a top border for visual separation.
 *
 * Responsive behavior:
 * - Mobile (<600px): full-width
 * - Tablet/Desktop (>=600px): centered with max-width 1024px and horizontal padding
 *
 * Accessibility:
 * - All action buttons rendered inside must have a minimum 48px tap target.
 * - When safeArea is true (default), paddingBottom clears the mobile home indicator.
 */
export function StickyActionBar({
  children,
  className = "",
  safeArea = true,
}: StickyActionBarProps) {
  const safeAreaPadding = safeArea
    ? { paddingBottom: "env(safe-area-inset-bottom, 16px)" }
    : {};

  const containerStyle: CSSProperties = {
    position: "sticky",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTop: `1px solid ${colors.borderCard}`,
    boxShadow: `0 -4px 16px rgba(0, 0, 0, 0.06)`,
    zIndex: 50,
    ...safeAreaPadding,
  };

  const innerStyle: CSSProperties = {
    width: "100%",
    maxWidth: "1024px",
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  };

  const buttonRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: "48px",
  };

  return (
    <div className={className} style={containerStyle}>
      <div style={innerStyle}>
        <div style={buttonRowStyle}>{children}</div>
      </div>
    </div>
  );
}
