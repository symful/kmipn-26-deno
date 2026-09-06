import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Report, ReportStatus } from "../types";
import { MapView } from "../components/MapView";
import { PageHead } from "../components/ReferencePage";
import { StatusBadge } from "../components/StatusBadge";
import { useCategoryOptions } from "../hooks/useCategoryOptions";
import { ALL_STATUSES } from "../lib/report-statuses";

export const CaseList = () => {
  const [params, setParams] = useSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [layer, setLayer] = useState<
    "standard" | "satellite" | "no_labels" | "facilities"
  >("standard");
  const [mode, setMode] = useState("clusters");
  const { categories } = useCategoryOptions();
  const [villages, setVillages] = useState<string[]>([]);
  const view = params.get("view") === "list" ? "list" : "map";
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  const status = params.get("status") || "";
  const category = params.get("category_id") || "";
  const village = params.get("village_id") || "";
  const severity = params.get("severity") || "";
  const sla = params.get("sla") || "";
  const search = params.get("search") || "";
  const month = params.get("month") || "";
  const priority = params.get("priority") || "";
  const isNew = params.get("new") || "";
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const filter = {
      status,
      category_id: category,
      village_id: village,
      severity,
      sla,
      search,
      month,
      priority,
      limit: 100,
    };
    api
      .reports(filter)
      .then(async (first) => {
        const pages = Math.ceil(
          (first.pagination?.total ?? first.data.length) / 100,
        );
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
            api.reports({ ...filter, page: i + 2 }),
          ),
        );
        if (!active) return;
        const rows = [...first.data, ...rest.flatMap((r) => r.data)];
        setReports(rows);
        setVillages((previous) =>
          [
            ...new Set([
              ...previous,
              ...rows
                .map(
                  (r) => r.address_area || r.village_name || r.kelurahan || "",
                )
                .filter(Boolean),
            ]),
          ].sort(),
        );
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat kasus");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    status,
    category,
    village,
    severity,
    sla,
    search,
    month,
    priority,
    reload,
  ]);
  const shown = reports.filter(
    (r) =>
      !isNew || Date.now() - new Date(r.created_at).getTime() < 7 * 86400000,
  );
  const reset = () => {
    setParams({});
    setLayer("standard");
    setMode("markers");
  };
  return (
    <div>
      <PageHead
        title="Peta & sebaran kasus"
        subtitle="Jelajahi kondisi infrastruktur, prioritas, dan batas layanan desa."
      />
      <div className="ref-filters">
        <select
          className="ref-select"
          aria-label="Filter desa"
          value={village}
          onChange={(e) => update("village_id", e.target.value)}
        >
          <option value="">Semua desa</option>
          {villages.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          className="ref-select"
          aria-label="Filter kategori"
          value={category}
          onChange={(e) => update("category_id", e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className="ref-select"
          aria-label="Filter status"
          value={status}
          onChange={(e) => update("status", e.target.value)}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value ? s.label : "Semua status"}
            </option>
          ))}
        </select>
        <input
          className="ref-input"
          type="month"
          aria-label="Periode laporan"
          value={month}
          onChange={(e) => update("month", e.target.value)}
        />
        <button className="ref-button" onClick={reset}>
          Reset
        </button>
        <span className="flex-1" />
        <small>
          <b>{shown.length}</b> kasus ditemukan
        </small>
        <button
          className={`ref-button ${view === "map" ? "primary" : ""}`}
          onClick={() => update("view", "map")}
        >
          ◈ Peta
        </button>
        <button
          className={`ref-button ${view === "list" ? "primary" : ""}`}
          onClick={() => update("view", "list")}
        >
          ☷ Daftar
        </button>
      </div>
      <div className="ref-filters">
        {priority && (
          <StatusBadge tone="success" label="Prioritas tinggi" size="sm" />
        )}
        {isNew && <StatusBadge tone="info" label="Kasus baru" size="sm" />}
        <select
          className="ref-select"
          aria-label="Filter keparahan"
          value={severity}
          onChange={(e) => update("severity", e.target.value)}
        >
          <option value="">Semua tingkat keparahan</option>
          <option value="kritis">Kritis</option>
          <option value="berat">Berat</option>
          <option value="sedang">Sedang</option>
          <option value="ringan">Ringan</option>
        </select>
        <select
          className="ref-select"
          aria-label="Filter SLA"
          value={sla}
          onChange={(e) => update("sla", e.target.value)}
        >
          <option value="">Semua status SLA</option>
          <option value="normal">Normal</option>
          <option value="at_risk">Mendekati SLA</option>
          <option value="breached">Melewati SLA</option>
        </select>
        <select
          className="ref-select"
          aria-label="Layer peta"
          value={layer}
          onChange={(e) => setLayer(e.target.value as typeof layer)}
        >
          <option value="standard">Standar</option>
          <option value="satellite">Citra satelit</option>
          <option value="no_labels">Tanpa batas desa</option>
          <option value="facilities">Fasilitas publik</option>
        </select>
        <select
          className="ref-select"
          aria-label="Visualisasi peta"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="markers">Titik Kasus</option>
          <option value="clusters">Kelompok laporan berdekatan</option>
          <option value="heatmap">Heatmap</option>
        </select>
      </div>
      {error ? (
        <div className="ref-notice" role="alert">
          {error}{" "}
          <button
            className="ref-button"
            onClick={() => setReload((r) => r + 1)}
          >
            Coba lagi
          </button>
        </div>
      ) : loading ? (
        <div className="ref-card text-center p-12">Memuat kasus…</div>
      ) : view === "map" ? (
        <div className="rounded-[9px] overflow-hidden border border-sigap-border">
          <MapView
            reports={shown}
            height="610px"
            mode={mode === "heatmap" ? "heatmap" : "markers"}
            layer={layer}
            cluster={mode === "clusters"}
            publicMap={false}
          />
        </div>
      ) : (
        <div className="ref-list-mode">
          {shown.map((r) => (
            <Link
              className="ref-case-card"
              key={r.id}
              to={`/system/cases/${r.id}`}
            >
              <span className="w-9 h-9 rounded-[9px] grid place-items-center shrink-0 font-mono text-[11px] font-semibold bg-sigap-primaryLight text-sigap-primary">
                {(r.category?.name || "").slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h3>{r.title || r.description}</h3>
                <p>
                  {r.address_area ||
                    r.village_name ||
                    r.kelurahan ||
                    "Wilayah belum tersedia"}{" "}
                  · diperbarui{" "}
                  {new Date(r.updated_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <div className="flex gap-2.5 items-center flex-wrap">
                  <StatusBadge status={r.status} size="sm" />
                  <small className="text-xs text-sigap-textTertiary">
                    {r.report_count ?? 1 + (r.supporting_count ?? 0)} laporan
                  </small>
                </div>
              </div>
            </Link>
          ))}
          {!shown.length && (
            <p className="text-sm text-sigap-textMuted">
              Tidak ada kasus sesuai filter.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
