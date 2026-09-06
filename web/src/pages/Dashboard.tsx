import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { QueueCounts, Report, SyncQuality } from "../types";
import {
  PageHead,
  TrendChart,
  type TrendBucket,
} from "../components/ReferencePage";
import { MapView } from "../components/MapView";
import { StatusBadge } from "../components/StatusBadge";
import { formatWIB } from "../lib/dashboard-data";

export function Dashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [buckets, setBuckets] = useState<TrendBucket[]>([]);
  const [quality, setQuality] = useState<SyncQuality | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.reports({ limit: 100 }).then(async (first) => {
        const pages = Math.ceil(
          (first.pagination?.total ?? first.data.length) / 100,
        );
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
            api.reports({ limit: 100, page: i + 2 }),
          ),
        );
        return [...first.data, ...rest.flatMap((p) => p.data)];
      }),
      api.queueCounts(),
      api.adminBacklog(),
      api.syncQuality(),
    ])
      .then(([rows, queue, backlog, sync]) => {
        if (active) {
          setReports(rows);
          setCounts(queue);
          setBuckets(backlog.buckets ?? []);
          setQuality(sync);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat ringkasan");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const villages = new Set(
    reports
      .map((r) => r.address_area || r.village_name || r.kelurahan)
      .filter(Boolean),
  ).size;
  const critical = reports
    .filter(
      (r) =>
        !["resolved", "rejected", "duplicate_merged", "out_of_scope"].includes(
          r.status,
        ),
    )
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    .filter((r) => (r.priority_score ?? 0) >= 80)
    .slice(0, 4);
  const metrics = [
    ["Kasus baru", counts?.new_reports, "#2563eb", "/system/cases?new=1"],
    [
      "Perlu verifikasi",
      counts?.needs_verification,
      "#b8730a",
      "/system/queue",
    ],
    [
      "SLA terlewat",
      counts?.sla_breached,
      "#c0392b",
      "/system/cases?sla=breached",
    ],
    [
      "Prioritas tinggi",
      counts?.high_priority,
      "#0f7a6b",
      "/system/cases?priority=high",
    ],
    [
      "Perlu kelengkapan",
      counts?.needs_completion,
      "#8a9099",
      "/system/cases?status=needs_completion",
    ],
  ] as const;
  return (
    <div className="ref-dashboard">
      <PageHead
        title="Apa yang harus ditangani hari ini?"
        subtitle={`Data per ${formatWIB(new Date())} · cakupan ${villages} desa`}
      />
      {error && (
        <div className="ref-notice mb-4" role="alert">
          {error}{" "}
          <button
            className="ref-button"
            onClick={() => setReload((n) => n + 1)}
          >
            Coba lagi
          </button>
        </div>
      )}
      <div className="ref-metrics">
        {metrics.map(([label, count, color, to]) => (
          <Link
            key={label}
            to={to}
            className="ref-metric"
            style={{ borderTopColor: color }}
          >
            <strong style={{ color }}>
              {loading || count == null ? "—" : count}
            </strong>
            <span>{label}</span>
            <small>Lihat kasus terkait ↗</small>
          </Link>
        ))}
      </div>
      <div className="ref-grid ref-two">
        <div className="ref-stack">
          <section className="ref-card">
            <div className="ref-card-head">
              <div>
                <h2>Umur backlog kasus</h2>
                <p>Arus laporan dan penyelesaian · 30 hari terakhir</p>
              </div>
            </div>
            <TrendChart buckets={buckets} />
          </section>
          <section className="ref-card">
            <div className="ref-card-head">
              <h2>Sebaran kasus di wilayah Anda</h2>
              <Link
                className="text-[11px] font-semibold text-sigap-primary"
                to="/system/cases"
              >
                Buka Peta & Kasus Penuh ↗
              </Link>
            </div>
            <div className="rounded-[9px] overflow-hidden">
              <MapView reports={reports} height="250px" publicMap={false} />
            </div>
          </section>
        </div>
        <div className="ref-stack">
          <section className="ref-card">
            <div className="ref-card-head">
              <h2>Kasus perlu perhatian</h2>
              <StatusBadge tone="danger" label="Prioritas tinggi" size="sm" />
            </div>
            {critical.length ? (
              critical.map((r) => (
                <Link
                  key={r.id}
                  className="ref-critical"
                  to={`/system/cases/${r.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-sigap-textTertiary">
                      {r.id.slice(0, 8)} · {r.category?.name?.toUpperCase()}
                    </span>
                    {r.deadline && (
                      <StatusBadge
                        tone={
                          new Date(r.deadline).getTime() < Date.now()
                            ? "danger"
                            : "warning"
                        }
                        label={
                          new Date(r.deadline).getTime() < Date.now()
                            ? "SLA terlewat"
                            : `SLA ${Math.max(0, Math.ceil((new Date(r.deadline).getTime() - Date.now()) / 3600000))}j`
                        }
                        size="sm"
                      />
                    )}
                  </div>
                  <h3>{r.title || r.description}</h3>
                  <div className="flex items-center justify-between">
                    <small>
                      {r.address_area ||
                        r.village_name ||
                        r.kelurahan ||
                        "Wilayah belum tersedia"}{" "}
                      · {r.report_count ?? 1 + (r.supporting_count ?? 0)}{" "}
                      laporan
                    </small>
                    <b className="text-xs text-sigap-primary">
                      {r.priority_score} ↗
                    </b>
                  </div>
                </Link>
              ))
            ) : (
              <p>
                {loading
                  ? "Memuat kasus…"
                  : "Tidak ada kasus kritis pada cakupan ini."}
              </p>
            )}
          </section>
          <section className="ref-card">
            <h2>Pengiriman laporan dari aplikasi</h2>
            <p>
              {quality?.pending_sync_count == null
                ? "Perangkat belum mengirimkan informasi antreannya. Laporan yang sudah diterima tetap dapat ditangani."
                : quality.pending_sync_count > 0
                  ? `${quality.pending_sync_count} laporan masih tersimpan dalam antrean perangkat yang mengirim status. Minta pengguna menghubungkan aplikasi ke internet agar laporan dapat diterima.`
                  : "Tidak ada laporan tertunda pada status perangkat yang terakhir diterima. Perangkat lain atau perubahan setelah pembaruan ini belum tercakup."}
            </p>
            {!!quality?.failed_sync_count && (
              <p>
                {quality.failed_sync_count} pengiriman memerlukan percobaan
                ulang dari aplikasi.
              </p>
            )}
            {quality && (
              <details className="mt-3 text-xs">
                <summary>Cakupan informasi pengiriman</summary>
                {quality.sync_percentage != null && (
                  <p>
                    {quality.sync_percentage}% laporan yang tercatat pada
                    perangkat pelapor telah tersinkron. Angka ini tidak mencakup
                    perangkat yang belum mengirim status.
                  </p>
                )}
                <p>
                  {quality.total} laporan telah diterima;{" "}
                  {quality.offline_originated} sebelumnya dikirim melalui
                  antrean offline.
                </p>
                {quality.reporting_devices != null && (
                  <p>
                    Status antrean berasal dari {quality.reporting_devices}{" "}
                    perangkat yang mengirim pembaruan, bukan seluruh perangkat
                    pengguna.
                  </p>
                )}
                {quality.last_observed_at && (
                  <p>
                    Pembaruan terakhir:{" "}
                    {new Date(quality.last_observed_at).toLocaleString("id-ID")}
                    .
                  </p>
                )}
              </details>
            )}{" "}
          </section>
        </div>
      </div>
      <div className="ref-footer">
        <span>SIGAP · Infrastruktur terpantau, pembangunan terarah.</span>
        <span>KMIPN 2026</span>
      </div>
    </div>
  );
}
