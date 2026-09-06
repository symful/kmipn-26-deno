import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Report } from "../types";
import {
  PageHead,
  TrendChart,
  type TrendBucket,
} from "../components/ReferencePage";
import { useCategoryOptions } from "../hooks/useCategoryOptions";
import { MapView } from "../components/MapView";

export const Analytics = () => {
  const { rawCategories } = useCategoryOptions();
  const [reports, setReports] = useState<Report[]>([]);
  const [buckets, setBuckets] = useState<TrendBucket[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.reports({ limit: 100 }).then(async (first) => {
        const rest = await Promise.all(
          Array.from(
            {
              length: Math.max(
                0,
                Math.ceil((first.pagination?.total ?? 0) / 100) - 1,
              ),
            },
            (_, i) => api.reports({ limit: 100, page: i + 2 }),
          ),
        );
        return [...first.data, ...rest.flatMap((p) => p.data)];
      }),
      api.adminBacklog(),
    ])
      .then(([rows, trend]) => {
        if (active) {
          setReports(rows);
          setBuckets(trend.buckets ?? []);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat analitik");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const categories = reports.reduce<Record<string, number>>(
    (result, r) => {
      const name = r.category?.name || "Tanpa kategori";
      result[name] = (result[name] ?? 0) + 1;
      return result;
    },
    Object.fromEntries(rawCategories.map((category) => [category.name, 0])),
  );
  return (
    <div>
      <PageHead
        title="Pola laporan dan penanganan"
        subtitle="Bandingkan jumlah laporan menurut fasilitas dan ikuti perkembangan penanganan. Gunakan peta untuk melihat area dengan laporan yang berdekatan atau kerusakan yang lebih berat, lalu tinjau laporan sebelum menentukan rencana kerja."
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
      <div className="ref-grid ref-equal">
        <section className="ref-card">
          <div className="ref-card-head">
            <h2>Kasus per kategori infrastruktur</h2>
            <small>{reports.length} kasus</small>
          </div>
          {Object.entries(categories).map(([name, count]) => (
            <div className="ref-score-line" key={name}>
              <span>{name}</span>
              <div className="ref-progress">
                <i
                  style={{
                    width: `${(count / Math.max(1, reports.length)) * 100}%`,
                  }}
                />
              </div>
              <b>{count}</b>
            </div>
          ))}
          {!reports.length && (
            <p>{loading ? "Memuat data…" : "Belum ada kasus."}</p>
          )}
        </section>
        <section className="ref-card">
          <div className="ref-card-head">
            <h2>Tren penyelesaian kasus</h2>
            <small>30 hari terakhir</small>
          </div>
          <TrendChart buckets={buckets} />
        </section>
      </div>
      <section className="ref-card" style={{ marginTop: 18 }}>
        <div className="ref-card-head">
          <h2>Sebaran laporan kerusakan</h2>
          <Link
            to="/system/cases"
            className="text-[11px] font-semibold text-sigap-primary"
          >
            Buka peta laporan ↗
          </Link>
        </div>
        <div className="rounded-[9px] overflow-hidden">
          <MapView
            reports={reports.filter((r) => (r.priority_score ?? 0) >= 70)}
            height="610px"
            mode="heatmap"
            publicMap={false}
          />
        </div>
      </section>
    </div>
  );
};
