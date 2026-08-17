import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import type { Report, PriorityResponse } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { TimelineRail } from "../../components/case-detail/TimelineRail";
import { SupportingGallery } from "../../components/case-detail/SupportingGallery";
import { api } from "../../api/client";
import { useAuthStore } from "../../stores/auth";
import { colors, statusLabel, extendedColors, surfaceColors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

type TabType = "ringkasan" | "bukti" | "verifikasi" | "tugas" | "audit";

export const OperatorCaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [priority, setPriority] = useState<PriorityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("ringkasan");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.report(id);
      setReport(r);
    } catch {
      setError("Gagal memuat laporan");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPriority = useCallback(async () => {
    if (!id) return;
    try {
      const p = await api.reportPriority(id);
      setPriority(p);
    } catch {
      setPriority(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (report) {
      loadPriority();
    }
  }, [report, loadPriority]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: extendedColors.bgScreen }}>
        <p className="text-sm" style={{ color: colors.textMuted }}>Memuat...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: extendedColors.bgScreen }}>
        <p className="text-sm" style={{ color: colors.textMuted }}>Laporan tidak ditemukan.</p>
      </div>
    );
  }

  const tabs = [
    { id: "ringkasan" as TabType, label: "Ringkasan" },
    { id: "bukti" as TabType, label: "Bukti & Laporan" },
    { id: "verifikasi" as TabType, label: "Verifikasi" },
    { id: "tugas" as TabType, label: "Tugas & Progres" },
    { id: "audit" as TabType, label: "Riwayat Audit" },
  ];

  const openStreetMapUrl = report.lat && report.lng
    ? `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}&zoom=16`
    : null;

  const getPriorityTextColor = (level: string) => {
    switch (level) {
      case "Kritis": return "text-danger-600";
      case "Tinggi": return "text-warning-600";
      case "Sedang": return "text-info-600";
      case "Rendah": return "text-primary-700";
      default: return "text-neutral-500";
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: extendedColors.bgScreen }}>
      <div
        className="border-b px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: extendedColors.bgSoft, borderColor: colors.border }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#e06c60" }}></div>
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#e8bd57" }}></div>
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#66c07f" }}></div>
        </div>
        <div
          className="flex-1 max-w-md rounded-md px-3 py-1.5 flex items-center gap-2"
          style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
        >
          <div
            className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.primary }}
          >
            <span className="text-[6px] font-bold text-white">P</span>
          </div>
          <span className="text-xs font-mono" style={{ color: colors.textTertiary }}>app.pantaudesa.id/kasus/{report.id}</span>
        </div>
      </div>

      <div className="bg-white border-b px-6 pt-4 pb-0" style={{ borderColor: colors.border }}>
        <div className="flex items-start gap-3.5">
          <div className="flex-1">
            <div className="flex items-center gap-2.5 text-xs">
              <Link
                to="/operator/cases"
                className="font-semibold hover:underline"
                style={{ color: colors.primary }}
              >
                Peta &amp; Kasus
              </Link>
              <span style={{ color: colors.textTertiary }}>/</span>
              <span className="font-mono" style={{ color: colors.textTertiary }}>{report.id}</span>
            </div>

            <div className="flex items-center gap-2.5 mt-1.5">
              <span
                className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: colors.primaryLight, color: colors.primaryDark }}
              >
                {report.category?.name ?? report.category_id}
              </span>
              <h2 className="text-xl font-bold" style={{ color: colors.textPrimary }}>{report.description}</h2>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: surfaceColors.offlineBg, color: surfaceColors.offlineText }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: surfaceColors.offlineDot }}></span>
                {statusLabel(report.status)}
              </span>
              {priority && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${getPriorityTextColor(priority.level)}`}
                  style={{ backgroundColor: colors.dangerBg }}
                >
                  Prioritas {priority.level}
                </span>
              )}
              <span className="font-mono text-xs" style={{ color: colors.textTertiary }}>
                {report.category?.name ?? "Desa"} · {report.photo_urls.length} laporan pendukung
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="text-xs px-3.5 py-2 rounded-lg font-semibold transition-colors"
              style={{ borderColor: colors.border, color: extendedColors.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = extendedColors.bgSoft}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              Gabungkan
            </button>
            <button
              className="text-xs px-4 py-2 rounded-lg font-bold text-white transition-colors"
              style={{ backgroundColor: colors.primary }}
            >
              Verifikasi kasus
            </button>
          </div>
        </div>

        <div className="flex gap-5 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="pb-3 text-sm font-semibold transition-colors border-b-2"
              style={{
                color: activeTab === tab.id ? colors.primary : colors.textTertiary,
                borderColor: activeTab === tab.id ? colors.primary : "transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-hidden">
        <div className="grid grid-cols-[1fr_340px] h-full">
          <div className="p-5 overflow-y-auto">
            <div className="flex flex-col gap-4">
              {error && (
                <div className="bg-danger-100 border border-danger-500/30 text-danger-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                  <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
                </div>
              )}

              {activeTab === "ringkasan" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {report.lat != null && report.lng != null && (
                      <div className="bg-white rounded-xl overflow-hidden" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                        <div className="h-[150px] relative" style={{ backgroundColor: "#eaeee9" }}>
                          <div className="absolute inset-0 opacity-40" style={{
                            backgroundImage: "linear-gradient(#dfe4de 1px, transparent 1px), linear-gradient(90deg, #dfe4de 1px, transparent 1px)",
                            backgroundSize: "30px 30px"
                          }}></div>
                          <span
                            className="absolute left-1/2 top-1/2 w-4 h-4 rounded-full border-2 border-white"
                            style={{ backgroundColor: colors.danger, transform: "translate(-50%, -100%) rotate(-45deg)" }}
                          ></span>
                        </div>
                        <div className="p-3 flex justify-between items-center">
                          <span className="font-mono text-xs" style={{ color: colors.textTertiary }}>
                            {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                          </span>
                          <a
                            href={openStreetMapUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold hover:underline"
                            style={{ color: colors.primary }}
                          >
                            Buka peta penuh
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="bg-white rounded-xl p-4" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                      <h4 className="text-xs font-bold uppercase tracking-wider mb-2.5" style={{ color: colors.textTertiary }}>Dampak</h4>
                      <div className="flex flex-col gap-2.5">
                        <div className="flex gap-2.5 items-center">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colors.danger }}></span>
                          <span className="text-sm" style={{ color: colors.textPrimary }}>Akses terputus untuk ±2 dusun</span>
                        </div>
                        <div className="flex gap-2.5 items-center">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colors.danger }}></span>
                          <span className="text-sm" style={{ color: colors.textPrimary }}>Risiko keselamatan tinggi</span>
                        </div>
                        <div className="flex gap-2.5 items-center">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colors.warning }}></span>
                          <span className="text-sm" style={{ color: colors.textPrimary }}>Layanan sekolah terganggu</span>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t text-xs leading-relaxed" style={{ borderColor: extendedColors.bgSoft, color: colors.textTertiary }}>
                        Konsolidasi dari <b style={{ color: colors.textPrimary }}>{report.photo_urls.length} laporan warga</b> dalam radius 120 m sejak {new Date(report.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}.
                      </div>
                    </div>
                  </div>

                  {priority && (
                    <div className="bg-white rounded-xl p-4" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3.5">
                          <div>
                            <div className="text-3xl font-bold leading-none" style={{ color: colors.primaryDark }}>{priority.score}</div>
                            <div className="text-xs" style={{ color: colors.textTertiary }}>Skor prioritas / 100</div>
                          </div>
                          <span
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold"
                            style={{ backgroundColor: colors.primaryLight, color: colors.primaryDark }}
                          >
                            Confidence tinggi
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs" style={{ color: colors.textTertiary }}>model v{priority.version}</div>
                          <button
                            className="mt-1.5 cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold"
                            style={{ borderColor: colors.border, backgroundColor: colors.bgCard, color: extendedColors.textSecondary }}
                          >
                            Override beralasan
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-3">
                          <span className="w-[130px] text-xs" style={{ color: extendedColors.textSecondary }}>Keselamatan</span>
                          <div className="flex-1 h-2 rounded overflow-hidden" style={{ backgroundColor: extendedColors.bgSoft }}>
                            <div className="h-full rounded" style={{ width: `${priority.breakdown.severity}%`, backgroundColor: colors.primary }}></div>
                          </div>
                          <span className="font-mono w-8 text-right text-xs font-semibold">+{priority.breakdown.severity}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="w-[130px] text-xs" style={{ color: extendedColors.textSecondary }}>Jumlah terdampak</span>
                          <div className="flex-1 h-2 rounded overflow-hidden" style={{ backgroundColor: extendedColors.bgSoft }}>
                            <div className="h-full rounded" style={{ width: `${priority.breakdown.affected_residents}%`, backgroundColor: colors.primary }}></div>
                          </div>
                          <span className="font-mono w-8 text-right text-xs font-semibold">+{priority.breakdown.affected_residents}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="w-[130px] text-xs" style={{ color: extendedColors.textSecondary }}>Laporan pendukung</span>
                          <div className="flex-1 h-2 rounded overflow-hidden" style={{ backgroundColor: extendedColors.bgSoft }}>
                            <div className="h-full rounded" style={{ width: `${priority.breakdown.region_vulnerability}%`, backgroundColor: colors.primary }}></div>
                          </div>
                          <span className="font-mono w-8 text-right text-xs font-semibold">+{priority.breakdown.region_vulnerability}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="w-[130px] text-xs" style={{ color: extendedColors.textSecondary }}>Kelewatan SLA</span>
                          <div className="flex-1 h-2 rounded overflow-hidden" style={{ backgroundColor: extendedColors.bgSoft }}>
                            <div className="h-full rounded" style={{ width: `${priority.breakdown.sla_pressure}%`, backgroundColor: colors.warning }}></div>
                          </div>
                          <span className="font-mono w-8 text-right text-xs font-semibold">+{priority.breakdown.sla_pressure}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <SupportingGallery reportId={id ?? ""} />
                </>
              )}

              {activeTab === "bukti" && (
                <div className="space-y-4">
                  {report.photo_urls.length > 0 && (
                    <div className="bg-white rounded-xl p-4" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                      <h3 className="text-sm font-bold mb-3" style={{ color: colors.textPrimary }}>Foto Bukti</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {report.photo_urls.map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-28 object-cover rounded-lg"
                            style={{ borderColor: colors.border }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <SupportingGallery reportId={id ?? ""} />
                </div>
              )}

              {activeTab === "verifikasi" && (
                <div className="bg-white rounded-xl p-5" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                  <p className="text-sm" style={{ color: colors.textTertiary }}>Verifikasi akan ditampilkan di sini.</p>
                </div>
              )}

              {activeTab === "tugas" && (
                <div className="bg-white rounded-xl p-5" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                  <p className="text-sm" style={{ color: colors.textTertiary }}>Tugas dan progres akan ditampilkan di sini.</p>
                </div>
              )}

              {activeTab === "audit" && (
                <div className="bg-white rounded-xl p-5" style={{ borderColor: colors.border, borderWidth: "1px" }}>
                  <h3 className="text-sm font-bold mb-4" style={{ color: colors.textPrimary }}>Riwayat Audit</h3>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.primary }}></span>
                        <span className="w-0.5 h-8" style={{ backgroundColor: colors.border }}></span>
                      </div>
                      <div className="pb-4">
                        <div className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Laporan dibuat</div>
                        <div className="font-mono text-xs" style={{ color: colors.textTertiary }}>
                          {new Date(report.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })} · sistem
                        </div>
                      </div>
                    </div>
                    {report.status !== "submitted" && (
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.primary }}></span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Status: {report.status}</div>
                          <div className="font-mono text-xs" style={{ color: colors.textTertiary }}>
                            {new Date(report.updated_at).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            className="border-l bg-white p-5 overflow-y-auto flex flex-col gap-3.5"
            style={{ borderColor: colors.border }}
          >
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textTertiary }}>Timeline &amp; keputusan</div>
            <TimelineRail reportId={id ?? ""} />

            <div className="mt-auto rounded-lg px-3 py-2.5 flex gap-2.5" style={{ backgroundColor: extendedColors.bgSoft }}>
              <span
                className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ borderColor: colors.textTertiary, color: colors.textTertiary }}
              >
                i
              </span>
              <span className="text-xs leading-relaxed" style={{ color: extendedColors.textSecondary }}>Identitas pelapor &amp; metadata EXIF berada di disclosure terpisah, hanya untuk peran berwenang.</span>
            </div>
          </div>
        </div>
      </main>

      <div
        className="sticky bottom-0 z-50 bg-white border-t px-6 py-3"
        style={{ borderColor: colors.border }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs mr-auto" style={{ color: colors.textTertiary }}>Aksi kasus:</span>
          <button
            className="text-xs px-3.5 py-2 rounded-lg font-semibold transition-colors"
            style={{ borderColor: colors.border, color: extendedColors.textSecondary }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = extendedColors.bgSoft}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            Ubah status
          </button>
          <button
            className="text-xs px-3.5 py-2 rounded-lg font-semibold transition-colors"
            style={{ borderColor: colors.border, color: extendedColors.textSecondary }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = extendedColors.bgSoft}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            Ekspor kasus
          </button>
          <button
            className="text-xs px-3.5 py-2 rounded-lg font-semibold transition-colors"
            style={{ borderColor: colors.border, color: extendedColors.textSecondary }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = extendedColors.bgSoft}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            Tugaskan unit
          </button>
          <button
            className="text-xs px-4 py-2 rounded-lg font-bold text-white transition-colors"
            style={{ backgroundColor: colors.primary }}
          >
            Verifikasi &amp; prioritaskan
          </button>
        </div>
      </div>
    </div>
  );
};
