import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { PriorityFormulaVersion } from "../types";
import { useAuthStore } from "../stores/auth";
import { PageHead } from "../components/ReferencePage";

type Weights = {
  severity: number;
  impact: number;
  report_count: number;
  sla: number;
};
const defaults: Weights = {
  severity: 40,
  impact: 25,
  report_count: 20,
  sla: 15,
};
const fields = [
  ["severity", "Keselamatan"],
  ["impact", "Warga terdampak"],
  ["report_count", "Laporan pendukung"],
  ["sla", "SLA"],
] as const;

export const PriorityConfig = () => {
  const user = useAuthStore((s) => s.user);
  const [version, setVersion] = useState<PriorityFormulaVersion | null>(null);
  const [weights, setWeights] = useState<Weights>(defaults);
  const [saved, setSaved] = useState<Weights>(defaults);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .getPriorityConfigVersions(1, 100)
      .then((data) => {
        if (!active) return;
        const current =
          data.data.find((v) => v.is_active) ?? data.data[0] ?? null;
        setVersion(current);
        if (current) {
          const values = current.weights as Partial<Weights>;
          const next = {
            severity: (values.severity ?? 0) * 100,
            impact: (values.impact ?? 0) * 100,
            report_count: (values.report_count ?? 0) * 100,
            sla: (values.sla ?? 0) * 100,
          };
          setWeights(next);
          setSaved(next);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat konfigurasi");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      Math.abs(Object.values(weights).reduce((sum, n) => sum + n, 0) - 100) >
      0.001
    ) {
      setError("Total bobot harus sama dengan 100%.");
      return;
    }
    if (!reason.trim()) {
      setError("Alasan perubahan formula wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const normalized = {
        severity: weights.severity / 100,
        impact: weights.impact / 100,
        report_count: weights.report_count / 100,
        sla: weights.sla / 100,
      };
      const created = await api.createPriorityConfigVersion(
        normalized,
        reason.trim(),
      );
      const activated = await api.activatePriorityConfigVersion(
        created.version,
        reason.trim(),
      );
      setVersion(activated);
      setSaved({ ...weights });
      setReason("");
      setSuccess(
        "Konfigurasi tersimpan dan diaktifkan. Alasan perubahan tercatat di audit.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan konfigurasi");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <PageHead
        title="Administrasi"
        subtitle="Konfigurasi formula prioritas dan tata kelola data."
      />
      <div className="ref-grid ref-equal">
        <section className="ref-card">
          <h2>
            Komponen skor{" "}
            {version ? `rumus versi ${version.version}` : "prioritas"}
          </h2>
          <p style={{ margin: "12px 0" }}>
            Konfigurasi digunakan sebagai rincian skor dasar. Skor aktif kasus
            dapat disesuaikan oleh admin dengan mencatat alasan perubahan.
          </p>
          {version &&
            version.weights.report_count == null &&
            (version.weights.vulnerability ?? 0) > 0 && (
              <div className="ref-notice mb-4">
                Versi aktif masih memakai faktor kerentanan. Tetapkan bobot
                laporan pendukung dan sesuaikan total menjadi 100% untuk membuat
                formula baru; formula aktif tetap berlaku sampai konfigurasi
                disimpan.
              </div>
            )}
          {error && (
            <div className="ref-notice mb-4" role="alert">
              {error}
              <button
                className="ref-button ml-2"
                type="button"
                onClick={() => setReload((n) => n + 1)}
              >
                Muat ulang
              </button>
            </div>
          )}
          {success && (
            <div className="ref-notice mb-4" role="status">
              {success}
            </div>
          )}
          <form className="ref-stack" onSubmit={submit}>
            {fields.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 text-sm"
              >
                {label}
                <input
                  className="ref-input w-[180px]"
                  name={key}
                  type="number"
                  min="0"
                  max="40"
                  step="1"
                  required
                  disabled={loading || saving}
                  value={weights[key]}
                  onChange={(e) =>
                    setWeights((previous) => ({
                      ...previous,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
            <input
              className="ref-input"
              aria-label="Alasan perubahan formula"
              placeholder="Alasan perubahan formula"
              required
              disabled={loading || saving}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="ref-button primary"
              disabled={loading || saving || user?.role !== "ADMIN"}
            >
              {saving ? "Menyimpan…" : "Simpan konfigurasi"}
            </button>
          </form>
        </section>
        <section className="ref-card">
          <h2>Penanggung jawab perubahan</h2>
          <p style={{ margin: "15px 0" }}>
            {user?.name || "Pengguna"} ·{" "}
            {user?.role === "ADMIN" ? "Administrator" : user?.role}
            <br />
            Periksa bobot dan alasan perubahan sebelum menyimpan rumus baru.
          </p>
          <div className="ref-notice">
            Saat Anda menyimpan perubahan, aplikasi membuat versi rumus baru dan
            mencatat alasannya. Pemeriksa berikutnya dapat menelusuri perubahan
            melalui riwayat aktivitas.
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              className="ref-button"
              disabled={loading || saving}
              onClick={() => {
                setWeights({ ...saved });
                setReason("");
                setError("");
                setSuccess("");
              }}
            >
              Reset perubahan formulir
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
