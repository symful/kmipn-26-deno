import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { PriorityFormulaVersion } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { logger } from "@/lib/logger";

type Weights = {
  severity: number;
  impact: number;
  vulnerability: number;
  sla: number;
};

const DEFAULT_WEIGHTS: Weights = {
  severity: 0.4,
  impact: 0.25,
  vulnerability: 0.2,
  sla: 0.15,
};

const WEIGHT_META: { key: keyof Weights; label: string; description: string; color: string }[] = [
  { key: "severity", label: "Severity", description: "Tingkat keparahan laporan", color: "#c0392b" },
  { key: "impact", label: "Impact", description: "Jumlah warga terdampak", color: "#2563eb" },
  { key: "vulnerability", label: "Vulnerability", description: "Kerentanan wilayah", color: "#8a5808" },
  { key: "sla", label: "SLA Pressure", description: "Sisa waktu sebelum violate SLA", color: "#0f7a6b" },
];

function computePreview(weights: Weights): number {
  const sample = { severity: 0.6, impact: 0.3, vulnerability: 0.4, sla: 0.5 };
  const score =
    sample.severity * weights.severity +
    sample.impact * weights.impact +
    sample.vulnerability * weights.vulnerability +
    sample.sla * weights.sla;
  return Math.round(score * 100);
}

const GridIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="1" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="2"/>
    <path d="M7 1V3M7 11V13M1 7H3M11 7H13M2.93 2.93L4.34 4.34M9.66 9.66L11.07 11.07M2.93 11.07L4.34 9.66M9.66 4.34L11.07 2.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const MapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1L13 4V10L7 13L1 10V4L7 1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

const QueueIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2"/>
  </svg>
);

const NavIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "grid": return <GridIcon />;
    case "settings": return <SettingsIcon />;
    case "map": return <MapIcon />;
    case "queue": return <QueueIcon />;
    default: return <GridIcon />;
  }
};

const navItems = [
  { icon: "grid", label: "Ringkasan", path: "/admin" },
  { icon: "settings", label: "Konfigurasi Prioritas", path: "/admin/priority-config", active: true },
  { icon: "map", label: "Peta & Kasus", path: "/admin/cases" },
  { icon: "queue", label: "Antrean Verifikasi", path: "/admin/verifikator" },
];

export const AdminPriorityConfig = () => {
  const [versions, setVersions] = useState<PriorityFormulaVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<PriorityFormulaVersion | null>(null);
  const [editWeights, setEditWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";

  const loadVersions = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getPriorityConfigVersions(1, 50)
      .then((res) => {
        setVersions(res.data);
        if (res.data.length > 0 && !selectedVersion) {
          setSelectedVersion(res.data[0] ?? null);
        }
      })
      .catch((e) => { logger.error("Failed to fetch priority config versions", { error: e }); setError("Gagal memuat versi formula. Coba lagi."); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const activeVersion = versions.find((v) => v.is_active);

  const selectVersion = (v: PriorityFormulaVersion) => {
    setSelectedVersion(v);
    setEditWeights({ ...v.weights });
    setSuccessMsg(null);
    setError(null);
  };

  const handleCreateVersion = async () => {
    if (!isAdmin) return;
    setCreating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const newVersion = await api.createPriorityConfigVersion(DEFAULT_WEIGHTS);
      setVersions((prev) => [newVersion, ...prev]);
      setSelectedVersion(newVersion);
      setEditWeights(DEFAULT_WEIGHTS);
      setSuccessMsg(`Versi ${newVersion.version} berhasil dibuat.`);
    } catch (e) {
      logger.error("Failed to create priority config version", { error: e });
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveWeights = async () => {
    if (!selectedVersion || selectedVersion.is_active) return;
    const sum = Object.values(editWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      setError("Total bobot harus sama dengan 100%");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.updatePriorityConfigVersion(selectedVersion.version, editWeights);
      setVersions((prev) =>
        prev.map((v) => (v.version === updated.version ? { ...v, weights: updated.weights } : v))
      );
      setSelectedVersion((prev) => (prev ? { ...prev, weights: updated.weights } : null));
      setSuccessMsg(`Versi ${updated.version} berhasil disimpan.`);
    } catch (e) {
      logger.error("Failed to save weights", { error: e });
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (version: PriorityFormulaVersion) => {
    if (!isAdmin || version.is_active) return;
    setActivating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const activated = await api.activatePriorityConfigVersion(version.version);
      setVersions((prev) =>
        prev.map((v) => ({
          ...v,
          is_active: v.version === activated.version,
          activated_at: v.version === activated.version ? activated.activated_at : v.activated_at,
          activated_by: v.version === activated.version ? activated.activated_by : v.activated_by,
        }))
      );
      setSelectedVersion((prev) =>
        prev ? { ...prev, is_active: prev.version === activated.version } : null
      );
      setSuccessMsg(`Versi ${activated.version} sekarang aktif.`);
    } catch (e) {
      logger.error("Failed to activate version", { error: e });
      setError((e as Error).message);
    } finally {
      setActivating(false);
    }
  };

  const totalWeight = Object.values(editWeights).reduce((a, b) => a + b, 0);
  const isValid = Math.abs(totalWeight - 1) < 0.001;
  const previewScore = computePreview(editWeights);

  return (
    <div className="flex min-h-[100dvh] bg-sigap-surface">
      {/* Sidebar */}
      <aside className="w-[220px] bg-surface-sidebar text-sigap-textMuted flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-4 pb-5">
          <div className="w-8 h-8 rounded-lg bg-sigap-primary flex items-center justify-center text-white font-bold text-base">
            P
          </div>
          <span className="text-base font-bold text-white">PantauDesa</span>
        </div>

        <nav className="px-3 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? "bg-sigap-primary text-white"
                  : "hover:bg-[#234A43] text-sigap-textMuted"
              }`}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-4 border-t border-[#234A43]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#9DC0B9]">
            <span className="w-8 h-8 rounded-full bg-sigap-primary flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.slice(0, 2).toUpperCase() ?? "AD"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate text-white">{user?.name ?? "Admin"}</div>
              <div className="text-[10px] text-[#9DC0B9] truncate">{user?.role ?? "ADMIN"}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-sigap-border flex items-center gap-4 px-6 shrink-0 bg-white">
          <div className="ml-auto flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-bold text-primary-600">
              {user?.name?.slice(0, 2).toUpperCase() ?? "AD"}
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-5">
          {/* Page Title */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-sigap-textPrimary">Konfigurasi Prioritas</h2>
              <p className="text-xs text-sigap-textTertiary mt-0.5">Kelola versi formula penentuan prioritas kasus</p>
            </div>
            {isAdmin && (
              <button
                onClick={handleCreateVersion}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-sigap-primary hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {creating ? "Membuat..." : "Buat versi baru"}
              </button>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-danger-100 border border-danger-200 text-sm text-danger-600">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
              {successMsg}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-white rounded-xl border border-sigap-border animate-pulse" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
              <p className="text-sm text-sigap-textMuted">Belum ada versi formula.</p>
              {isAdmin && (
                <button
                  onClick={handleCreateVersion}
                  className="mt-3 text-sm text-sigap-primary font-semibold hover:underline"
                >
                  Buat versi pertama
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Version History */}
              <div className="lg:col-span-1">
                <h3 className="text-xs font-semibold text-sigap-textTertiary mb-3 uppercase tracking-wide">
                  Riwayat Versi
                </h3>
                <div className="space-y-2">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => selectVersion(v)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedVersion?.version === v.version
                          ? "border-sigap-primary bg-sigap-primary/5"
                          : "border-sigap-border bg-white hover:border-sigap-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-sigap-textPrimary">
                          v{v.version}
                        </span>
                        {v.is_active && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-600"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-sigap-primary mr-1.5" />
                            Aktif
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-sigap-textMuted">
                        {new Date(v.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      {v.is_active && v.activated_at && (
                        <p className="text-xs text-sigap-textMuted mt-0.5">
                          Diaktifkan{" "}
                          {new Date(v.activated_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Version Editor */}
              <div className="lg:col-span-2">
                {selectedVersion ? (
                  <div className="bg-white rounded-xl border border-sigap-border p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-lg text-sigap-textPrimary">
                          Edit Versi {selectedVersion.version}
                        </h3>
                        {selectedVersion.is_active && (
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-600"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-sigap-primary mr-1.5" />
                            Aktif
                          </span>
                        )}
                      </div>
                      {!selectedVersion.is_active && isAdmin && (
                        <button
                          onClick={() => handleActivate(selectedVersion)}
                          disabled={activating}
                          className="text-sm px-4 py-2 rounded-lg border border-sigap-primary text-sigap-primary hover:bg-sigap-primary/5 transition-colors disabled:opacity-50 font-medium"
                        >
                          {activating ? "Mengaktifkan..." : "Aktifkan"}
                        </button>
                      )}
                    </div>

                    {selectedVersion.is_active ? (
                      <div className="space-y-4">
                        <p className="text-sm text-sigap-textMuted">
                          Bobot formula versi aktif sedang digunakan untuk menghitung prioritas kasus.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {WEIGHT_META.map((meta) => (
                            <div
                              key={meta.key}
                              className="bg-sigap-background rounded-lg p-4 border border-sigap-border"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: meta.color }}
                                />
                                <span className="text-xs font-semibold text-sigap-textTertiary uppercase tracking-wide">
                                  {meta.label}
                                </span>
                              </div>
                              <p className="text-2xl font-bold text-sigap-textPrimary">
                                {(selectedVersion.weights[meta.key] * 100).toFixed(0)}%
                              </p>
                              <p className="text-xs text-sigap-textMuted mt-1">{meta.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-5">
                          {WEIGHT_META.map((meta) => (
                            <WeightField
                              key={meta.key}
                              label={meta.label}
                              description={meta.description}
                              value={editWeights[meta.key]}
                              onChange={(v) =>
                                setEditWeights((w) => ({ ...w, [meta.key]: v }))
                              }
                              color={meta.color}
                            />
                          ))}
                        </div>

                        <div className="mt-5 p-4 bg-sigap-background rounded-lg border border-sigap-border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-sigap-textTertiary">
                              Total Bobot:
                            </span>
                            <span
                              className={`text-sm font-bold ${
                                isValid ? "text-primary-600" : "text-danger-500"
                              }`}
                            >
                              {(totalWeight * 100).toFixed(1)}%
                            </span>
                          </div>
                          {!isValid && (
                            <p className="text-xs text-danger-500 mb-2">
                              Total bobot harus sama dengan 100%
                            </p>
                          )}
                          <div className="h-2 bg-sigap-border rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all duration-300 rounded-full"
                              style={{
                                width: `${Math.min(totalWeight * 100, 100)}%`,
                                backgroundColor: isValid ? "#0f7a6b" : "#c0392b",
                              }}
                            />
                          </div>
                        </div>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={handleSaveWeights}
                            disabled={saving || !isValid}
                            className="w-full mt-4 px-4 py-3 bg-sigap-primary text-white rounded-lg font-semibold disabled:opacity-50 hover:bg-primary-600 transition-colors"
                          >
                            {saving ? "Menyimpan..." : "Simpan"}
                          </button>
                        )}
                      </>
                    )}

                    <div className="mt-6 pt-5 border-t border-sigap-border">
                      <h4 className="text-sm font-semibold mb-3 text-sigap-textTertiary uppercase tracking-wide">
                        Preview Perhitungan
                      </h4>
                      <p className="text-xs text-sigap-textMuted mb-3">
                        Simulasi skor prioritas untuk kasus contoh dengan nilai normalisasi:
                      </p>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {WEIGHT_META.map((meta) => (
                          <div key={meta.key} className="text-center bg-sigap-background rounded-lg p-2">
                            <p className="text-xs text-sigap-textMuted">{meta.label}</p>
                            <p className="text-xs font-semibold text-sigap-textPrimary">
                              0.{meta.key === "severity" ? "6" : meta.key === "impact" ? "3" : meta.key === "vulnerability" ? "4" : "5"}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between bg-sigap-background rounded-lg p-3 border border-sigap-border">
                        <span className="text-sm font-medium text-sigap-textTertiary">
                          Skor Prioritas:
                        </span>
                        <span className="text-xl font-bold text-sigap-primary">{previewScore}</span>
                      </div>
                      <p className="text-xs text-sigap-textMuted mt-2">
                        Rumus: Σ(normalized_value × weight) × 100
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-sigap-border p-8 text-center">
                    <p className="text-sm text-sigap-textMuted">Pilih versi untuk melihat detail</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 p-4 bg-white rounded-xl border border-sigap-border">
            <h4 className="text-sm font-semibold mb-2 text-sigap-textPrimary">Tentang Formula Prioritas</h4>
            <p className="text-xs text-sigap-textMuted leading-relaxed">
              Formula prioritas menentukan bagaimana skor kasus dihitung. Setiap versi menyimpan
              bobot untuk 4 faktor: Severity (keparahan), Impact (dampak jumlah warga), Vulnerability
              (kerentanan wilayah), dan SLA Pressure (tekanan waktu SLA). Bobot harus selalu
              berjumlah 100%. Hanya versi yang diaktifkan yang digunakan untuk kalkulasi skor baru.
              Mengubah versi aktif tidak mempengaruhi skor kasus yang sudah dihitung.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

type WeightFieldProps = {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  color: string;
};

function WeightField({ label, description, value, onChange, color }: WeightFieldProps) {
  return (
    <div className="flex items-start gap-4 p-4 bg-sigap-background rounded-lg border border-sigap-border">
      <div
        className="w-1 h-full min-h-[60px] rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-semibold text-sigap-textPrimary">{label}</label>
          <span
            className="text-sm font-bold px-2 py-0.5 rounded text-sigap-textPrimary"
            style={{ backgroundColor: `${color}20` }}
          >
            {(value * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-xs text-sigap-textMuted mb-3">{description}</p>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-sigap-border rounded-full appearance-none cursor-pointer"
          style={{ accentColor: color }}
        />
      </div>
    </div>
  );
}
