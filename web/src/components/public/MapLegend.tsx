import { colors } from "../../theme/tokens";

export const MapLegend = () => {
  const items = [
    { color: colors.diproses, label: "Terverifikasi" },
    { color: colors.warning, label: "Menunggu verifikasi" },
    { color: colors.primary, label: "Sedang ditangani" },
  ];

  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: colors.bgCard,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 6px 16px -8px rgba(0,0,0,.3)",
      }}
    >
      <h4
        className="mb-1.5 uppercase"
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: colors.textTertiary,
          letterSpacing: "0.04em",
        }}
      >
        Status Kasus
      </h4>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="flex-shrink-0"
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                backgroundColor: item.color,
              }}
            />
            <span style={{ fontSize: 12, color: colors.textSecondary }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
