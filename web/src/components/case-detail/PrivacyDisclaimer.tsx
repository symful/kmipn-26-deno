import { bgSoft, colors } from "../../theme/tokens";

interface PrivacyDisclaimerProps {
  text?: string;
}

export function PrivacyDisclaimer({
  text = "Data pribadi korban dilindungi dan tidak akan dipublikasikan.",
}: PrivacyDisclaimerProps) {
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5"
      style={{
        backgroundColor: bgSoft,
        borderRadius: 10,
      }}
    >
      <div
        className="flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded-full border-2"
        style={{
          borderColor: colors.textTertiary,
          color: colors.textTertiary,
        }}
      >
        <span
          className="text-[11px] font-bold leading-none"
          style={{ color: colors.textTertiary }}
        >
          i
        </span>
      </div>

        <p
        className="text-[11.5px] leading-[1.4] m-0"
        style={{
          color: colors.textSecondary,
        }}
      >
        {text}
      </p>
    </div>
  );
}
