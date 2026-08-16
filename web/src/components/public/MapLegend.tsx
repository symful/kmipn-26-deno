import { colors } from "../../theme/tokens";

const legendItems = [
  { label: "Terverifikasi", color: colors.primary },
  { label: "Menunggu", color: "#FBBF24" },
  { label: "Sedang ditangani", color: "#3B82F6" },
] as const;

interface MapLegendProps {
  className?: string;
}

export function MapLegend({ className = "" }: MapLegendProps) {
  return (
    <div
      className={`bg-white rounded-xl border p-3 ${className}`}
      style={{
        borderColor: colors.border,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <div
        className="text-xs font-semibold mb-2"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: colors.textPrimary,
        }}
      >
        Status kasus
      </div>

      <div className="flex flex-col gap-1.5">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span
              className="text-xs font-medium"
              style={{
                fontSize: 11,
                color: colors.textSecondary,
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
