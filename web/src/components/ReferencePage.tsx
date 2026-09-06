import type { ReactNode } from "react";
import "../reference-layout.css";

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ref-page-head">
      <div>
        <div className="ref-eyebrow">SISTEM INFORMASI GEOSPASIAL DESA</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && (
        <div className="flex gap-2.5 items-center flex-wrap">{actions}</div>
      )}
    </div>
  );
}

export type TrendBucket = {
  day: string;
  laporan_count: number;
  kasus_count: number;
  completed_count?: number;
};
export function TrendChart({ buckets }: { buckets: TrendBucket[] }) {
  const max = Math.max(
    1,
    ...buckets.flatMap((b) => [b.laporan_count, b.completed_count ?? 0]),
  );
  const format = (day: string) =>
    new Date(day + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    });
  const ticks = buckets.filter(
    (_, i) =>
      buckets.length <= 5 ||
      i === buckets.length - 1 ||
      i % Math.ceil((buckets.length - 1) / 4) === 0,
  );
  return (
    <>
      <div className="ref-chart-legend">
        <span>
          <i />
          Laporan masuk
        </span>
        <span>
          <i />
          Kasus selesai
        </span>
      </div>
      <div className="ref-chart">
        {buckets.length ? (
          buckets.map((b) => (
            <div
              key={b.day}
              className="ref-bar-group"
              title={`${format(b.day)}: ${b.laporan_count} masuk, ${b.completed_count ?? "belum tersedia"} selesai`}
            >
              <i style={{ height: `${(b.laporan_count / max) * 100}%` }} />
              <i
                style={{ height: `${((b.completed_count ?? 0) / max) * 100}%` }}
              />
            </div>
          ))
        ) : (
          <p className="m-auto text-xs text-sigap-textMuted">
            Belum ada data tren.
          </p>
        )}
      </div>
      <div className="ref-axis">
        {ticks.map((b) => (
          <span key={b.day}>{format(b.day)}</span>
        ))}
      </div>
    </>
  );
}
