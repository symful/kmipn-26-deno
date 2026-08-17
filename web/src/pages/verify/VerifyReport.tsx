import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";
import { colors } from "../../theme/tokens";

type ReportData = {
  id: string;
  category_name?: string;
  description?: string;
  status?: string;
};

export default function VerifyReport() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [verdict, setVerdict] = useState<"confirmed" | "rejected">("confirmed");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Token verifikasi tidak ada di URL.");
      return;
    }
    setLoading(true);
    setLoadError(null);
    api
      .rtRwVerifyGet(token)
      .then((data) => {
        if (!data.id) {
          setLoadError("Token tidak valid atau laporan tidak ditemukan.");
          return;
        }
        setReport(data);
      })
      .catch((e) => { logger.error("Failed to verify report", { error: e }); setLoadError(`Token tidak valid atau kadaluarsa: ${(e as Error).message}`); })
      .finally(() => setLoading(false));
  }, [token]);

  const canSubmit = !!report && !submitting && reason.trim().length > 0;

  async function submit() {
    if (!report || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.rtRwVerifyPost({
        verification_token: token,
        report_id: report.id,
        verdict,
        reason,
      });
      setDone(true);
    } catch (e) {
      logger.error("Failed to submit verification", { error: e });
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <div className="p-6 bg-success-100 text-success-700 rounded text-center">
          <h1 className="text-2xl font-bold mb-2">Verifikasi terkirim</h1>
          <p>Terima kasih. Verifikasi Anda telah dicatat.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Verifikasi RT/RW</h1>
        <Link
          to="/verify/training"
          className="text-sm font-medium text-sigap-primary hover:underline flex items-center gap-1"
        >
          <span>📚</span>
          <span>Pelatihan</span>
        </Link>
      </div>

      <div className="mb-4 text-sm text-sigap-textMuted">
        <span>Token: {token ? `${token.slice(0, 20)}...` : "(tidak ada)"}</span>
      </div>

      {loading && (
        <p className="text-sigap-textMuted">Memuat laporan...</p>
      )}

      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {loadError}
        </div>
      )}

      {report && (
        <div className="bg-white rounded-lg p-4 border border-sigap-border mb-4">
          <p className="text-sm font-semibold">
            {report.category_name ?? "Tanpa kategori"}
          </p>
          <p className="text-xs text-sigap-textMuted mt-1">
            Status saat ini: <strong>{report.status ?? "?"}</strong>
          </p>
          {report.description && (
            <p className="text-sm text-sigap-textSecondary mt-3 whitespace-pre-wrap">
              {report.description}
            </p>
          )}
        </div>
      )}

      {report && (
        <div className="bg-white rounded-lg p-4 border border-sigap-border space-y-3">
          <div>
            <label className="block font-semibold mb-1">Keputusan:</label>
            <select
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as "confirmed" | "rejected")}
              className="w-full p-2 border border-sigap-border rounded"
            >
              <option value="confirmed">Dikonfirmasi (benar ada kerusakan)</option>
              <option value="rejected">Ditolak (tidak valid)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Alasan (wajib):</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jelaskan keputusan Anda"
              className="w-full p-2 border border-sigap-border rounded"
              rows={3}
            />
          </div>

          {submitError && (
            <p className="text-sm text-sigap-perluTindakan bg-danger-50 p-2 rounded">
              {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full px-4 py-2 bg-sigap-primary text-white rounded font-medium disabled:opacity-50"
          >
            {submitting ? "Mengirim..." : "Kirim Verifikasi"}
          </button>
        </div>
      )}

      {/* Tutorial Section */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowTutorial(!showTutorial)}
          className="w-full text-left p-4 bg-sigap-background rounded-lg border border-sigap-border flex items-center justify-between"
        >
          <span className="font-semibold">📖 Panduan Verifikasi</span>
          <span className="text-sigap-textMuted">{showTutorial ? "▲" : "▼"}</span>
        </button>

        {showTutorial && (
          <div className="mt-2 p-4 bg-white rounded-lg border border-sigap-border space-y-6">
            <section>
              <h3 className="text-lg font-bold mb-3 text-sigap-primary">Cara Verifikasi Laporan</h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-sigap-primary text-white flex items-center justify-center font-bold text-sm flex-shrink-0">1</div>
                  <div>
                    <p className="font-medium">Periksa detail laporan</p>
                    <p className="text-sm text-sigap-textSecondary">Baca deskripsi, kategori, dan lokasi yang tertera.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-sigap-primary text-white flex items-center justify-center font-bold text-sm flex-shrink-0">2</div>
                  <div>
                    <p className="font-medium">Kunjungi lokasi</p>
                    <p className="text-sm text-sigap-textSecondary">Datang ke lokasi untuk memastikan kerusakan benar ada.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-sigap-primary text-white flex items-center justify-center font-bold text-sm flex-shrink-0">3</div>
                  <div>
                    <p className="font-medium">Berikan keputusan</p>
                    <p className="text-sm text-sigap-textSecondary">Pilih "Dikonfirmasi" jika valid, atau "Ditolak" jika tidak.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-sigap-primary text-white flex items-center justify-center font-bold text-sm flex-shrink-0">4</div>
                  <div>
                    <p className="font-medium">Tulis alasan</p>
                    <p className="text-sm text-sigap-textSecondary">Jelaskan keputusan Anda dengan detail.</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold mb-3 text-sigap-primary">Apa yang Harus Dicek</h3>
              <div className="bg-success-50 border border-success-100 rounded-lg p-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-success-600">✓</span>
                    <span>Kerusakan sesuai dengan deskripsi laporan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success-600">✓</span>
                    <span>Lokasi kerusakan cocok dengan koordinat</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success-600">✓</span>
                    <span>Kategori kerusakan sesuai dengan jenis kerusakan</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success-600">✓</span>
                    <span>Kerusakan masih belum diperbaiki</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success-600">✓</span>
                    <span>Foto bukti jelas dan dapat dipercaya</span>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold mb-3 text-sigap-primary">Kapan Harus Tolak</h3>
              <div className="bg-danger-50 border border-danger-100 rounded-lg p-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-danger-600">✗</span>
                    <span>Lokasi kerusakan tidak ditemukan atau berbeda</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-danger-600">✗</span>
                    <span>Kerusakan sudah diperbaiki atau tidak ada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-danger-600">✗</span>
                    <span>Laporan tidak jelas, duplikat, atau tidak valid</span>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold mb-3 text-sigap-primary">Pertanyaan Umum</h3>
              <div className="space-y-4">
                <details className="group">
                  <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                    <span>Bagaimana jika lokasi sulit diakses?</span>
                    <span className="text-sigap-textMuted group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <p className="text-sm text-sigap-textSecondary mt-2 pl-4 border-l-2 border-sigap-border">
                    Coba verifikasi dari titik terdekat yang memungkinkan. Jika benar-benar tidak bisa diakses, berikan alasan yang jelas di sistem.
                  </p>
                </details>
                <details className="group">
                  <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                    <span>Berapa lama waktu verifikasi?</span>
                    <span className="text-sigap-textMuted group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <p className="text-sm text-sigap-textSecondary mt-2 pl-4 border-l-2 border-sigap-border">
                    Idealnya verifikasi dilakukan dalam 1x24 jam setelah laporan masuk.
                  </p>
                </details>
                <details className="group">
                  <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                    <span>Apa yang harus dilakukan jika laporan tidak jelas?</span>
                    <span className="text-sigap-textMuted group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <p className="text-sm text-sigap-textSecondary mt-2 pl-4 border-l-2 border-sigap-border">
                    Hubungi pelapor untuk klarifikasi. Jika tidak bisa dihubungi, verifikasi berdasarkan informasi yang ada dan catat ketidakjelasan tersebut.
                  </p>
                </details>
              </div>
            </section>

            <div className="text-center pt-2">
              <Link
                to="/verify/training"
                className="text-sm font-medium text-sigap-primary hover:underline"
              >
                Lihat Pelatihan Lengkap →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
