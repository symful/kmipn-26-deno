import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { PriorityFormulaVersion } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
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
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SIGAP Admin</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Beranda
            </Link>
            <button
              onClick={() => useAuthStore.getState().clear()}
              className="text-sm text-sigap-perluTindakan hover:underline"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Konfigurasi Prioritas</h2>
            <p className="text-sm text-sigap-textMuted mt-1">
              Kelola versi formula penentuan prioritas kasus
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleCreateVersion}
              disabled={creating}
              className="px-4 py-2 bg-sigap-primary text-white rounded-lg text-sm font-medium hover:bg-sigap-primaryHover transition-colors disabled:opacity-50"
            >
              {creating ? "Membuat..." : "+ Versi Baru"}
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded bg-green-50 border border-green-200 text-sm text-green-700 mb-4">
            {successMsg}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-sigap-surface rounded-lg border border-sigap-border animate-pulse" />
            ))}
          </div>
        ) : versions.length === 0 ? (
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-8 text-center">
            <p className="text-sigap-textMuted text-sm">Belum ada versi formula.</p>
            {isAdmin && (
              <button
                onClick={handleCreateVersion}
                className="mt-3 text-sm text-sigap-primary hover:underline"
              >
                Buat versi pertama
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-2">
              <h3 className="text-sm font-medium text-sigap-textSecondary mb-2">Riwayat Versi</h3>
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => selectVersion(v)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedVersion?.version === v.version
                      ? "border-sigap-primary bg-sigap-primary/5"
                      : "border-sigap-border bg-sigap-surface hover:border-sigap-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Versi {v.version}</span>
                    {v.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sigap-selesai/10 text-sigap-selesai font-medium">
                        Aktif
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-sigap-textMuted mt-1">
                    {new Date(v.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
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

            <div className="lg:col-span-2">
              {selectedVersion ? (
                <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold">
                      Edit Versi {selectedVersion.version}
                      {selectedVersion.is_active && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-sigap-selesai/10 text-sigap-selesai font-medium">
                          Aktif
                        </span>
                      )}
                    </h3>
                    {selectedVersion.is_active ? (
                      <span className="text-xs text-sigap-textMuted">
                        Versi aktif tidak dapat diedit
                      </span>
                    ) : isAdmin ? (
                      <button
                        onClick={() => handleActivate(selectedVersion)}
                        disabled={activating}
                        className="text-xs px-3 py-1.5 rounded border border-sigap-selesai text-sigap-selesai hover:bg-sigap-selesai/5 transition-colors disabled:opacity-50"
                      >
                        {activating ? "Mengaktifkan..." : "Aktifkan Versi Ini"}
                      </button>
                    ) : null}
                  </div>

                  {selectedVersion.is_active ? (
                    <div className="space-y-4">
                      <p className="text-sm text-sigap-textMuted">
                        Bobot formula versi aktif sedang digunakan untuk menghitung prioritas kasus.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {WEIGHT_META.map((meta) => (
                          <div key={meta.key} className="bg-sigap-background rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: meta.color }}
                              />
                              <span className="text-xs font-medium text-sigap-textSecondary">
                                {meta.label}
                              </span>
                            </div>
                            <p className="text-lg font-bold text-sigap-textPrimary">
                              {(selectedVersion.weights[meta.key] * 100).toFixed(0)}%
                            </p>
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

                      <div className="mt-5 p-4 bg-sigap-background rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Total Bobot:</span>
                          <span
                            className={`text-sm font-bold ${
                              isValid ? "text-sigap-selesai" : "text-sigap-perluTindakan"
                            }`}
                          >
                            {(totalWeight * 100).toFixed(1)}%
                          </span>
                        </div>
                        {!isValid && (
                          <p className="text-xs text-sigap-perluTindakan">
                            Total bobot harus sama dengan 100%
                          </p>
                        )}
                        <div className="mt-2 h-2 bg-sigap-surface rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all duration-300"
                            style={{
                              width: `${Math.min(totalWeight * 100, 100)}%`,
                              backgroundColor: isValid ? colors.selesai : colors.perluTindakan,
                            }}
                          />
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={handleSaveWeights}
                          disabled={saving || !isValid}
                          className="w-full mt-4 px-4 py-2.5 bg-sigap-primary text-white rounded-lg font-medium disabled:opacity-50 hover:bg-sigap-primaryHover transition-colors"
                        >
                          {saving ? "Menyimpan..." : "Simpan Perubahan"}
                        </button>
                      )}
                    </>
                  )}

                  <div className="mt-6 pt-5 border-t border-sigap-border">
                    <h4 className="text-sm font-medium mb-3">Preview Perhitungan</h4>
                    <p className="text-xs text-sigap-textMuted mb-3">
                      Simulasi skor prioritas untuk kasus contoh dengan nilai normalisasi:
                    </p>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {WEIGHT_META.map((meta) => (
                        <div key={meta.key} className="text-center">
                          <p className="text-xs text-sigap-textMuted">{meta.label}</p>
                          <p className="text-xs font-medium">0.{meta.key === "severity" ? "6" : meta.key === "impact" ? "3" : meta.key === "vulnerability" ? "4" : "5"}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between bg-sigap-background rounded-lg p-3">
                      <span className="text-sm text-sigap-textSecondary">Skor Prioritas:</span>
                      <span className="text-lg font-bold text-sigap-primary">{previewScore}</span>
                    </div>
                    <p className="text-xs text-sigap-textMuted mt-2">
                      Rumus: Σ(normalized_value × weight) × 100
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-sigap-surface rounded-lg border border-sigap-border p-8 text-center">
                  <p className="text-sigap-textMuted text-sm">Pilih versi untuk melihat detail</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-sigap-surface rounded-lg border border-sigap-border">
          <h4 className="text-sm font-medium mb-2">Tentang Formula Prioritas</h4>
          <p className="text-xs text-sigap-textMuted leading-relaxed">
            Formula prioritas menentukan bagaimana skor kasus dihitung. Setiap versi menyimpan
            bobot untuk 4 faktor: Severity (keparahan), Impact (dampak jumlah warga), Vulnerability
            (kerentanan wilayah), dan SLA Pressure (tekanan waktu SLA). Bobot harus selalu
            berjumlah 100%. Hanya versi yang diaktifkan yang digunakan untuk kalkulasi skor baru.
            Mengubah versi aktif tidak mempengaruhi skor kasus yang sudah dihitung.
          </p>
        </div>
      </main>
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
    <div className="flex items-start gap-4">
      <div
        className="w-1 h-full min-h-[60px] rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">{label}</label>
          <span className="text-sm font-bold text-sigap-textPrimary">
            {(value * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-xs text-sigap-textMuted mb-2">{description}</p>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-sigap-background rounded-full appearance-none cursor-pointer"
          style={{ accentColor: color }}
        />
      </div>
    </div>
  );
}
