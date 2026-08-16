import { colors, spacing, radius } from "../../theme/tokens";

interface CaseActionButtonsProps {
  onGabungkan?: () => void;
  onVerifikasi?: () => void;
  disabled?: boolean;
}

export function CaseActionButtons({
  onGabungkan,
  onVerifikasi,
  disabled = false,
}: CaseActionButtonsProps) {
  return (
    <div
      className="flex gap-3"
      style={{
        padding: `${spacing.md}px`,
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
        backgroundColor: colors.surface,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <button
        type="button"
        onClick={onGabungkan}
        disabled={disabled}
        style={{
          flex: 1,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          paddingLeft: spacing.md,
          paddingRight: spacing.md,
          backgroundColor: "transparent",
          color: colors.textPrimary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: "opacity 0.15s ease",
        }}
      >
        Gabungkan
      </button>
      <button
        type="button"
        onClick={onVerifikasi}
        disabled={disabled}
        style={{
          flex: 1,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          paddingLeft: spacing.md,
          paddingRight: spacing.md,
          backgroundColor: colors.primary,
          color: "#ffffff",
          border: "none",
          borderRadius: radius.md,
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: "opacity 0.15s ease",
        }}
      >
        Verifikasi kasus
      </button>
    </div>
  );
}
