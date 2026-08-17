import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";

type ReportData = {
  id: string;
  category_name?: string;
  description?: string;
  status?: string;
};

type Verdict = "confirmed" | "needs_clarification" | "outdated" | "not_my_area" | "duplicate" | "rejected";

const VERDICT_LABELS: Record<Verdict, string> = {
  confirmed: "Dikonfirmasi (benar ada kerusakan)",
  needs_clarification: "Perlu klarifikasi",
  outdated: "Sudah tidak aktual",
  not_my_area: "Di luar jangkauan saya",
  duplicate: "Duplikat",
  rejected: "Ditolak",
};

export default function TokenVerify() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [verdict, setVerdict] = useState<Verdict>("confirmed");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Link verifikasi tidak valid atau sudah kadaluarsa");
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
      .catch((e) => {
        logger.error("Failed to verify report", { error: e });
        setLoadError(`Token tidak valid atau kadaluarsa: ${(e as Error).message}`);
      })
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
      <h1 className="text-2xl font-bold mb-4">Verifikasi RT/RW</h1>

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
              onChange={(e) => setVerdict(e.target.value as Verdict)}
              className="w-full p-2 border border-sigap-border rounded"
            >
              {(Object.keys(VERDICT_LABELS) as Verdict[]).map((v) => (
                <option key={v} value={v}>
                  {VERDICT_LABELS[v]}
                </option>
              ))}
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
    </div>
  );
}
