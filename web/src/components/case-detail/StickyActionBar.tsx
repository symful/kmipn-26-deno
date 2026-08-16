import { colors, spacing, radius } from "../../theme/tokens";

export interface StickyActionBarProps {
  onPindahkan?: () => void;
  onGabungkan?: () => void;
  onArsipkan?: () => void;
  onLacak?: () => void;
  onVerifikasi?: () => void;
  disabled?: boolean;
}

const SECONDARY_BUTTONS = [
  { label: "Pindahkan", key: "onPindahkan" as const },
  { label: "Gabungkan", key: "onGabungkan" as const },
  { label: "Arsipkan", key: "onArsipkan" as const },
  { label: "Lacak", key: "onLacak" as const },
];

export function StickyActionBar({
  onPindahkan,
  onGabungkan,
  onArsipkan,
  onLacak,
  onVerifikasi,
  disabled = false,
}: StickyActionBarProps) {
  const handlers = {
    onPindahkan,
    onGabungkan,
    onArsipkan,
    onLacak,
  };

  return (
    <div
      role="region"
      aria-label="Action bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.surface,
        borderTop: `1px solid ${colors.border}`,
        padding: `${spacing.md}px`,
        paddingBottom: `calc(${spacing.md}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 50,
      }}
    >
      <div className="flex gap-2">
        {SECONDARY_BUTTONS.map((btn) => {
          const handler = handlers[btn.key];
          return (
            <button
              key={btn.key}
              type="button"
              onClick={handler}
              disabled={disabled}
              style={{
                flex: 1,
                paddingTop: spacing.sm,
                paddingBottom: spacing.sm,
                paddingLeft: spacing.sm,
                paddingRight: spacing.sm,
                backgroundColor: "transparent",
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                fontSize: 13,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                transition: "opacity 0.15s ease",
                whiteSpace: "nowrap" as const,
                overflow: "hidden" as const,
                textOverflow: "ellipsis",
              }}
            >
              {btn.label}
            </button>
          );
        })}
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
            whiteSpace: "nowrap" as const,
          }}
        >
          Verifikasi &amp; prioritaskan
        </button>
      </div>
    </div>
  );
}
