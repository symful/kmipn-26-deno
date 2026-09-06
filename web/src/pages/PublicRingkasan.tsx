import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import {
  PageHead,
  TrendChart,
  type TrendBucket,
} from "../components/ReferencePage";
import type { PublicStats } from "../types";

export const PublicRingkasan = ({
  statistics = false,
}: {
  statistics?: boolean;
}) => {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [buckets, setBuckets] = useState<TrendBucket[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([api.publicStats(), api.publicStatsTrend({ days: 30 })])
      .then(([data, trend]) => {
        if (active) {
          setStats(data);
          setBuckets(trend.buckets ?? []);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat statistik");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const counts = stats?.by_status ?? {};
  const cards = [
    ["Sedang Ditangani", (counts.in_progress ?? 0) + (counts.assigned ?? 0)],
    ["Selesai", counts.resolved ?? 0],
    [
      "Menunggu verifikasi",
      (counts.submitted ?? 0) + (counts.under_review ?? 0),
    ],
    ["Terverifikasi", counts.verified ?? 0],
  ] as const;
  return (
    <div className="ref-content">
      <PageHead
        title={
          statistics
            ? "Statistik pembangunan desa"
            : "Bersama, pantau pembangunan desa."
        }
        subtitle="Lihat posisi laporan dalam proses penanganan. Jumlah pada setiap kelompok membantu Anda membedakan laporan yang masih diperiksa, yang sudah mendapat penugasan, dan yang telah selesai ditangani."
        actions={
          <Link className="ref-button primary" to="/peta">
            Jelajahi peta ↗
          </Link>
        }
      />
      {error ? (
        <div className="ref-notice" role="alert">
          {error}{" "}
          <button
            className="ref-button"
            onClick={() => setReload((n) => n + 1)}
          >
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          <div className="ref-grid ref-equal">
            {cards.map(([label, count]) => (
              <section className="ref-card" key={label}>
                <span className="ref-stat-number">{loading ? "—" : count}</span>
                <h2>{label}</h2>
                <p>
                  {label === "Sedang Ditangani"
                    ? "Admin telah menugaskan penanganan atau petugas sedang mengerjakannya."
                    : label === "Selesai"
                      ? "Admin telah menyelesaikan peninjauan hasil penanganan."
                      : label === "Menunggu verifikasi"
                        ? "Admin masih perlu memeriksa isi laporan sebelum menentukan tindak lanjut."
                        : "Admin telah memverifikasi laporan; laporan ini belum masuk kelompok penanganan atau selesai."}
                </p>
              </section>
            ))}
          </div>
          <section className="ref-card" style={{ marginTop: 20 }}>
            <div className="ref-card-head">
              <h2>Perkembangan penanganan</h2>
              <small>30 hari terakhir</small>
            </div>
            {loading ? <p>Memuat tren…</p> : <TrendChart buckets={buckets} />}
          </section>
        </>
      )}
    </div>
  );
};
