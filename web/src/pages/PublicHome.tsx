import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapView } from "../components/MapView";
import { colors, statusLabel } from "../theme/tokens";
import { api } from "../api/client";
import type { PublicReport, Report } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { useCategoryOptions } from "../hooks/useCategoryOptions";
import { PUBLIC_STATUS_OPTIONS } from "../lib/report-statuses";
import { PageHead } from "../components/ReferencePage";
import { PublicCaseModal } from "../components/public/PublicCaseModal";

export const PublicHome = ({
  initialCaseId,
}: { initialCaseId?: string } = {}) => {
  const navigate = useNavigate();
  const [features, setFeatures] = useState<PublicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [village, setVillage] = useState("");
  const [month, setMonth] = useState("");
  const [view, setView] = useState<"peta" | "daftar">("peta");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PublicReport | null>(null);
  const { categories } = useCategoryOptions();
  const requestVersion = useRef(0);
  const fetchReports = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const first = await api.publicReports({
        limit: 100,
        ...(month ? { month } : {}),
      });
      const rest = await Promise.all(
        Array.from(
          { length: Math.max(0, first.pagination.total_pages - 1) },
          (_, i) =>
            api.publicReports({
              limit: 100,
              page: i + 2,
              ...(month ? { month } : {}),
            }),
        ),
      );
      if (version !== requestVersion.current) return;
      setFeatures([
        ...(first.data ?? []),
        ...rest.flatMap((p) => p.data ?? []),
      ]);
    } catch (e) {
      if (version === requestVersion.current)
        setError(e instanceof Error ? e.message : "Gagal memuat kasus");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    void fetchReports();
    return () => {
      requestVersion.current++;
    };
  }, [fetchReports]);
  useEffect(() => {
    if (!initialCaseId || loading) return;
    const report = features.find((f) => f.id === initialCaseId);
    if (report) setSelected(report);
    else setError("Laporan tidak ditemukan atau belum dipublikasikan.");
  }, [initialCaseId, features, loading]);
  const villages = [
    ...new Set(
      features.map((f) => f.wilayah?.desa || f.general_wilayah).filter(Boolean),
    ),
  ].sort();
  const filtered = features.filter(
    (f) =>
      (!category || f.category?.id === category) &&
      (!status || f.status === status) &&
      (!village || (f.wilayah?.desa || f.general_wilayah) === village) &&
      (!search ||
        [f.title, f.general_wilayah, f.category?.name, f.id]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const reset = () => {
    setCategory("");
    setStatus("");
    setVillage("");
    setMonth("");
    setSearch("");
  };
  const toMap = (f: PublicReport): Report => ({
    id: f.id,
    title: f.title ?? null,
    status: f.status,
    lat: f.generalized_location!.lat,
    lng: f.generalized_location!.lng,
    category_id: f.category?.id ?? "",
    category: {
      id: f.category?.id ?? "",
      name: f.category?.name ?? "",
      icon: f.category?.icon ?? null,
    },
    description: "",
    idempotency_key: "",
    photo_urls: [],
    device_id: null,
    severity: f.severity ?? null,
    priority_score: null,
    priority_bucket: null,
    assigned_to: null,
    assignee: null,
    created_at: f.last_updated,
    updated_at: f.last_updated,
    supporting_count: f.supporting_count,
  });
  const categoryCode = (f: PublicReport) => {
    const name = f.category?.name?.toLowerCase() ?? "";
    return name.includes("jembatan")
      ? "JB"
      : name.includes("jalan")
        ? "JL"
        : name.includes("air")
          ? "AR"
          : name.includes("irigasi")
            ? "IR"
            : name.includes("fasilitas")
              ? "LP"
              : f.category?.short_code || name.slice(0, 2).toUpperCase();
  };
  const card = (f: PublicReport) => (
    <button key={f.id} className="ref-case-card" onClick={() => setSelected(f)}>
      <span
        className="w-9 h-9 rounded-[9px] grid place-items-center shrink-0 font-mono text-[11px] font-semibold"
        style={{ background: "#e2f1ee", color: "#0f7a6b" }}
      >
        {categoryCode(f)}
      </span>
      <div>
        <h3>{f.title || f.category?.name || `Kasus ${f.id.slice(0, 8)}`}</h3>
        <p>
          {f.general_wilayah} · diperbarui{" "}
          {new Date(f.last_updated).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        <div className="flex gap-2.5 items-center flex-wrap">
          <StatusBadge status={f.status} size="sm" />
          <small className="text-xs text-sigap-textTertiary">
            {f.report_count ?? 1 + (f.supporting_count ?? 0)} laporan
          </small>
        </div>
      </div>
    </button>
  );
  const searchInput = (
    <input
      className="ref-input sticky top-0 z-10 shrink-0"
      style={{ background: "#f4f5f3" }}
      aria-label="Cari wilayah atau fasilitas"
      placeholder="⌕  Cari wilayah atau fasilitas…"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  );
  return (
    <div className="ref-public-body">
      <PageHead
        title="Pembangunan desa, terbuka untuk semua."
        subtitle="Cari fasilitas atau wilayah untuk melihat keluhan warga dan perkembangan penanganannya. Pilih laporan untuk membaca bukti serta tindak lanjut; peta publik menampilkan gambaran lokasi, bukan titik rinci pelapor."
      />
      <div className="ref-filters">
        <select
          className="ref-select"
          aria-label="Filter desa"
          value={village}
          onChange={(e) => setVillage(e.target.value)}
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
          onChange={(e) => setCategory(e.target.value)}
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
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Semua status</option>
          {PUBLIC_STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className="ref-input"
          type="month"
          aria-label="Periode laporan"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <button className="ref-button" onClick={reset}>
          Hapus filter
        </button>
        <span className="flex-1" />
        <small>
          <b>{filtered.length}</b> kasus ditemukan
        </small>
        <button
          className={`ref-button ${view === "peta" ? "primary" : ""}`}
          onClick={() => setView("peta")}
        >
          ◈ Peta
        </button>
        <button
          className={`ref-button ${view === "daftar" ? "primary" : ""}`}
          onClick={() => setView("daftar")}
        >
          ☷ Daftar
        </button>
      </div>
      {error && (
        <div className="ref-notice mb-4" role="alert">
          {error}{" "}
          <button className="ref-button" onClick={() => void fetchReports()}>
            Coba lagi
          </button>
        </div>
      )}
      {view === "peta" ? (
        <div className="ref-public-split">
          <div className="ref-public-map">
            {loading ? (
              <p className="p-5 text-sm">Memuat peta…</p>
            ) : (
              <MapView
                reports={filtered
                  .filter((f) => f.generalized_location != null)
                  .filter(
                    (f) =>
                      f.generalized_location != null &&
                      Number.isFinite(f.generalized_location.lat) &&
                      Number.isFinite(f.generalized_location.lng),
                  )
                  .map(toMap)}
                height="100%"
                cluster={false}
                showDrawer={false}
                onSelectReport={(r) => {
                  if (r)
                    setSelected(features.find((f) => f.id === r.id) ?? null);
                }}
              />
            )}
          </div>
          <aside className="ref-public-cases">
            {searchInput}
            {loading ? (
              <p className="text-sm">Memuat kasus…</p>
            ) : filtered.length ? (
              filtered.map(card)
            ) : (
              <p className="text-sm p-5 text-center">
                Tidak ada kasus sesuai filter.
              </p>
            )}
          </aside>
        </div>
      ) : (
        <>
          {searchInput}
          <div className="ref-list-mode mt-4">{filtered.map(card)}</div>
          {!loading && !filtered.length && (
            <p className="p-5 text-sm">Tidak ada kasus sesuai filter.</p>
          )}
        </>
      )}
      <div className="ref-footer">
        <span style={{ flex: 1 }}>
          ◈ Lokasi publik digeneralisasi · Data pribadi pelapor tidak
          ditampilkan
        </span>
        <a
          href="https://drive.google.com/drive/folders/1aMUyQcEapn9TtHLfy9Ds5o8Fiz3CeY8i?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          className="ref-button primary"
        >
          ⬇ Download APK
        </a>
        <span style={{ flex: 1, textAlign: "right" }}>
          Data publik · {new Date().toLocaleDateString("id-ID")}
        </span>
      </div>
      <PublicCaseModal
        report={selected}
        onClose={() => {
          setSelected(null);
          if (initialCaseId) navigate("/peta", { replace: true });
        }}
      />
    </div>
  );
};
