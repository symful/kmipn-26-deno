import { colors } from "../../theme/tokens";

interface ClusterPin {
  label: string;
  count: number;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
}

const clusterPins: ClusterPin[] = [
  {
    label: "12 kasus",
    count: 12,
    width: 44,
    height: 26,
    backgroundColor: "#3B82F6",
    textColor: "white",
  },
  {
    label: "18 kasus",
    count: 18,
    width: 52,
    height: 30,
    backgroundColor: colors.primary,
    textColor: "white",
  },
  {
    label: "7 kasus",
    count: 7,
    width: 38,
    height: 24,
    backgroundColor: "#FBBF24",
    textColor: "#17191c",
  },
];

export interface MapClusterProps {
  className?: string;
}

export function MapCluster({ className = "" }: MapClusterProps) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: "#E6E8E3",
        borderRadius: 13,
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `
            linear-gradient(#6B7280 1px, transparent 1px),
            linear-gradient(90deg, #6B7280 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative w-full h-full flex items-center justify-center gap-8">
        {clusterPins.map((pin, index) => (
          <div
            key={index}
            className="flex flex-col items-center gap-1"
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: 6,
                borderRightWidth: 6,
                borderTopWidth: 8,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderTopColor: pin.backgroundColor,
                marginTop: -1,
              }}
            />

            <div
              style={{
                width: pin.width,
                height: pin.height,
                backgroundColor: pin.backgroundColor,
                borderRadius: pin.height / 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: pin.textColor,
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: pin.count >= 10 ? 10 : 11,
                fontWeight: 600,
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                whiteSpace: "nowrap",
              }}
            >
              {pin.label}
            </div>
          </div>
        ))}
      </div>

      <div
        className="absolute bottom-2 left-1/2 transform -translate-x-1/2"
        style={{
          backgroundColor: "rgba(255,255,255,0.85)",
          padding: "4px 12px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: colors.textTertiary,
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        }}
      >
        Peta Persebaran Kasus
      </div>
    </div>
  );
}
