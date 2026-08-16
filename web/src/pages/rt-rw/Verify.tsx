import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";
import { colors } from "../../theme/tokens";

type RtRwVerdict =
  | "confirmed"
  | "needs_clarification"
  | "outdated"
  | "not_my_area"
  | "duplicate"
  | "rejected";

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  notes?: string;
}

interface QueuedVerification {
  id: string;
  token: string;
  reportId: string;
  verdict: RtRwVerdict;
  checklist: ChecklistItem[];
  reason: string;
  queuedAt: string;
}

interface ReportData {
  id: string;
  category_name?: string;
  description?: string;
  status?: string;
  address?: string;
  lat?: number;
  lng?: number;
  photo_urls?: string[];
  created_at?: string;
  reporter_name?: string;
  reporter_phone?: string;
}

const VERDICT_LABELS: Record<RtRwVerdict, { label: string; description: string; color: string }> = {
  confirmed: {
    label: "Dikonfirmasi",
    description: "Kerusakan benar ada dan perlu ditindaklanjuti",
    color: "bg-green-600 hover:bg-green-700",
  },
  needs_clarification: {
    label: "Perlu Klarifikasi",
    description: "Butuh informasi tambahan sebelum memutuskan",
    color: "bg-yellow-600 hover:bg-yellow-700",
  },
  outdated: {
    label: "Sudah Tidak Relevan",
    description: "Kerusakan sudah diperbaiki atau tidak relevan lagi",
    color: "bg-gray-600 hover:bg-gray-700",
  },
  not_my_area: {
    label: "Di Luar Wilayah Saya",
    description: "Laporan tidak termasuk dalam wilayah RT/RW saya",
    color: "bg-orange-600 hover:bg-orange-700",
  },
  duplicate: {
    label: "Duplikat",
    description: "Laporan duplikat dari laporan lain yang sudah ada",
    color: "bg-purple-600 hover:bg-purple-700",
  },
  rejected: {
    label: "Ditolak",
    description: "Laporan tidak valid atau tidak dapat diproses",
    color: "bg-red-600 hover:bg-red-700",
  },
};

const REASON_MANDATORY: RtRwVerdict[] = ["outdated", "not_my_area", "duplicate", "rejected"];

const DEFAULT_CHECKLIST: Omit<ChecklistItem, "id">[] = [
  { text: "Kerusakan sesuai dengan deskripsi laporan", checked: false },
  { text: "Lokasi kerusakan cocok dengan koordinat", checked: false },
  { text: "Kategori kerusakan sesuai dengan jenis kerusakan", checked: false },
  { text: "Kerusakan masih belum diperbaiki", checked: false },
  { text: "Foto bukti jelas dan dapat dipercaya", checked: false },
  { text: "Tidak ada kerusakan yang sudah diperbaiki", checked: false },
];

const OFFLINE_QUEUE_KEY = "rtrw_verification_queue";

function loadOfflineQueue(): QueuedVerification[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedVerification[];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: QueuedVerification[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function addToOfflineQueue(
  token: string,
  reportId: string,
  verdict: RtRwVerdict,
  checklist: ChecklistItem[],
  reason: string
): void {
  const queue = loadOfflineQueue();
  queue.push({
    id: crypto.randomUUID(),
    token,
    reportId,
    verdict,
    checklist,
    reason,
    queuedAt: new Date().toISOString(),
  });
  saveOfflineQueue(queue);
  logger.info("Added verification to offline queue", { token, verdict, queueLength: queue.length });
}

function removeFromOfflineQueue(id: string): void {
  const queue = loadOfflineQueue();
  const filtered = queue.filter((q) => q.id !== id);
  saveOfflineQueue(filtered);
}

function isOnline(): boolean {
  return navigator.onLine;
}

export default function RtRwVerify() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [verdict, setVerdict] = useState<RtRwVerdict | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<QueuedVerification[]>([]);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "queued">("idle");
  const [showTutorial, setShowTutorial] = useState(false);

  const initializeChecklist = useCallback(() => {
    return DEFAULT_CHECKLIST.map((item, index) => ({
      ...item,
      id: `checklist-${index}`,
    }));
  }, []);

  useEffect(() => {
    if (!token) {
      setLoadError("Token verifikasi tidak ada di URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setOfflineQueue(loadOfflineQueue());

    api
      .rtRwVerifyGet(token)
      .then((data) => {
        if (!data.id) {
          setLoadError("Token tidak valid atau laporan tidak ditemukan.");
          return;
        }
        setReport(data as ReportData);
        setChecklist(initializeChecklist());
      })
      .catch((e) => {
        logger.error("Failed to verify report", { error: e });
        setLoadError(`Token tidak valid atau kadaluarsa: ${(e as Error).message}`);
      })
      .finally(() => setLoading(false));
  }, [token, initializeChecklist]);

  useEffect(() => {
    const handleOnline = () => {
      if (syncStatus === "queued" || offlineQueue.length > 0) {
        syncOfflineQueue();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncStatus, offlineQueue.length]);

  const toggleChecklist = useCallback((id: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  }, []);

  const updateChecklistNotes = useCallback((id: string, notes: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, notes } : item
      )
    );
  }, []);

  const canSubmit = (() => {
    if (!report || submitting) return false;
    if (!verdict) return false;
    if (REASON_MANDATORY.includes(verdict as RtRwVerdict)) {
      return reason.trim().length >= 10;
    }
    return true;
  })();

  const syncOfflineQueue = async () => {
    if (!isOnline()) return;

    const queue = loadOfflineQueue();
    if (queue.length === 0) return;

    setSyncStatus("syncing");

    for (const item of queue) {
      try {
        await api.rtRwVerifyPost({
          verification_token: item.token,
          report_id: item.reportId,
          verdict: item.verdict,
          reason: item.reason,
        });
        removeFromOfflineQueue(item.id);
        logger.info("Synced offline verification", { id: item.id, verdict: item.verdict });
      } catch (e) {
        logger.error(`Failed to sync verification ${item.id}`, { error: e });
      }
    }

    setOfflineQueue(loadOfflineQueue());
    setSyncStatus(offlineQueue.length > 0 ? "queued" : "idle");
  };

  const submit = async () => {
    if (!report || !canSubmit || !verdict) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      verification_token: token,
      report_id: report.id,
      verdict: verdict as RtRwVerdict,
      reason,
    };

    if (!isOnline()) {
      addToOfflineQueue(token, report.id, verdict as RtRwVerdict, checklist, reason);
      setOfflineQueue(loadOfflineQueue());
      setSyncStatus("queued");
      setDone(true);
      setSubmitting(false);
      return;
    }

    try {
      await api.rtRwVerifyPost(payload);
      setDone(true);
    } catch (e) {
      logger.error("Failed to submit verification", { error: e });

      if (!isOnline()) {
        addToOfflineQueue(token, report.id, verdict as RtRwVerdict, checklist, reason);
        setOfflineQueue(loadOfflineQueue());
        setSyncStatus("queued");
        setDone(true);
      } else {
        setSubmitError((e as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full border border-sigap-border shadow-sm">
          {syncStatus === "queued" ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-sigap-textPrimary mb-2">
                Tersimpan Offline
              </h2>
              <p className="text-sm text-sigap-textSecondary mb-4">
                Verifikasi Anda telah disimpan dan akan dikirim secara otomatis ketika koneksi internet tersedia.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-800">
                  <strong>Catatan:</strong> Pastikan untuk mengecek kembali setelah online untuk memastikan verifikasi terkirim.
                </p>
              </div>
              <p className="text-xs text-sigap-textMuted">
                {offlineQueue.length} verifikasi menunggu di antrean offline
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-sigap-textPrimary mb-2">
                Verifikasi Terkirim
              </h2>
              <p className="text-sm text-sigap-textSecondary mb-4">
                Terima kasih. Verifikasi Anda telah dicatat dan akan diproses oleh sistem.
              </p>
              <Link
                to="/rt-rw/training"
                className="inline-block px-4 py-2 bg-sigap-primary text-white rounded-lg text-sm font-medium hover:bg-sigap-primaryHover transition-colors"
              >
                Lihat Pelatihan
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-white border-b border-sigap-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Verifikasi RT/RW</h1>
              <p className="text-xs text-sigap-textMuted">Konfirmasi laporan kerusakan</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isOnline() && (
              <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">
                Offline
              </span>
            )}
            {offlineQueue.length > 0 && (
              <button
                onClick={syncOfflineQueue}
                disabled={!isOnline() || syncStatus === "syncing"}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium hover:bg-blue-200 transition-colors disabled:opacity-50"
              >
                {syncStatus === "syncing" ? "Menyinkronkan..." : `${offlineQueue.length} menunggu`}
              </button>
            )}
            <Link
              to="/rt-rw/training"
              className="text-sm font-medium text-sigap-primary hover:underline flex items-center gap-1"
            >
              Pelatihan
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="text-xs text-sigap-textMuted font-mono">
          Token: {token ? `${token.slice(0, 20)}...` : "(tidak ada)"}
        </div>

        {loading && (
          <div className="bg-white rounded-lg p-6 border border-sigap-border text-center">
            <p className="text-sigap-textMuted">Memuat laporan...</p>
          </div>
        )}

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        )}

        {report && (
          <>
            <div className="bg-white rounded-lg border border-sigap-border overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sigap-primary/10 text-sigap-primary">
                      {report.category_name ?? "Tanpa kategori"}
                    </span>
                    <p className="text-xs text-sigap-textMuted mt-1">
                      Status: <strong>{report.status ?? "?"}</strong>
                    </p>
                  </div>
                  <span className="text-xs text-sigap-textMuted">
                    {report.created_at
                      ? new Date(report.created_at).toLocaleDateString("id-ID")
                      : ""}
                  </span>
                </div>

                {report.description && (
                  <p className="text-sm text-sigap-textSecondary whitespace-pre-wrap mb-3">
                    {report.description}
                  </p>
                )}

                {report.address && (
                  <p className="text-xs text-sigap-textMuted mb-2">
                    <strong>Lokasi:</strong> {report.address}
                  </p>
                )}

                {report.reporter_name && (
                  <p className="text-xs text-sigap-textMuted">
                    <strong>Pelapor:</strong> {report.reporter_name}
                    {report.reporter_phone ? ` (${report.reporter_phone})` : ""}
                  </p>
                )}
              </div>

              {report.photo_urls && report.photo_urls.length > 0 && (
                <div className="border-t border-sigap-border p-4 bg-sigap-background">
                  <p className="text-xs font-semibold text-sigap-textMuted mb-2">Foto Bukti:</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {report.photo_urls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        <img
                          src={url}
                          alt={`Bukti ${i + 1}`}
                          className="w-20 h-20 object-cover rounded border border-sigap-border hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-sigap-border overflow-hidden">
              <div className="p-4 border-b border-sigap-border bg-sigap-background/50">
                <h3 className="font-semibold text-sm text-sigap-textPrimary">
                  Checklist Verifikasi
                </h3>
                <p className="text-xs text-sigap-textMuted mt-0.5">
                  Centang item yang sudah Anda verifikasi di lapangan
                </p>
              </div>

              <div className="p-4 space-y-3">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 p-3 rounded-lg border border-sigap-border hover:border-sigap-primary/30 transition-colors"
                  >
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={item.checked}
                      onChange={() => toggleChecklist(item.id)}
                      className="w-5 h-5 rounded border-sigap-border text-sigap-primary focus:ring-sigap-primary mt-0.5"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={item.id}
                        className={`text-sm font-medium cursor-pointer ${
                          item.checked ? "text-sigap-textMuted line-through" : "text-sigap-textPrimary"
                        }`}
                      >
                        {item.text}
                      </label>
                      <input
                        type="text"
                        placeholder="Catatan (opsional)"
                        value={item.notes ?? ""}
                        onChange={(e) => updateChecklistNotes(item.id, e.target.value)}
                        className="mt-2 w-full text-xs p-2 border border-sigap-border rounded focus:outline-none focus:ring-1 focus:ring-sigap-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-sigap-border overflow-hidden">
              <div className="p-4 border-b border-sigap-border">
                <h3 className="font-semibold text-sm text-sigap-textPrimary">
                  Keputusan Verifikasi
                </h3>
                <p className="text-xs text-sigap-textMuted mt-0.5">
                  Pilih opsi yang sesuai berdasarkan pengecekan Anda
                </p>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {(Object.entries(VERDICT_LABELS) as [RtRwVerdict, typeof VERDICT_LABELS[RtRwVerdict]][]).map(
                    ([key, { label, color }]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setVerdict(key)}
                        className={`px-3 py-2.5 rounded-lg text-sm font-medium text-white transition-all ${
                          verdict === key
                            ? color
                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>

                {verdict && VERDICT_LABELS[verdict] && (
                  <div className="mb-4 p-3 bg-sigap-background rounded-lg border border-sigap-border">
                    <p className="text-xs text-sigap-textSecondary">
                      {VERDICT_LABELS[verdict].description}
                    </p>
                  </div>
                )}

                {verdict && (
                  <div className="space-y-3 border-t border-sigap-border pt-4">
                    <div>
                      <label className="block text-sm font-semibold mb-1">
                        Alasan{" "}
                        {REASON_MANDATORY.includes(verdict as RtRwVerdict) ? (
                          <span className="text-red-500">*</span>
                        ) : (
                          <span className="text-sigap-textMuted font-normal">(opsional)</span>
                        )}
                        :
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={
                          verdict === "rejected"
                            ? "Jelaskan mengapa laporan ditolak (min. 10 karakter)"
                            : verdict === "outdated"
                            ? "Jelaskan mengapa sudah tidak relevan"
                            : verdict === "duplicate"
                            ? "ID laporan yang duplikat..."
                            : verdict === "not_my_area"
                            ? "Jelaskan mengapa di luar wilayah Anda..."
                            : "Catatan tambahan (opsional)"
                        }
                        className="w-full p-3 border border-sigap-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/30"
                        rows={3}
                      />
                      {REASON_MANDATORY.includes(verdict as RtRwVerdict) && reason.trim().length < 10 && (
                        <p className="text-xs text-red-500 mt-1">
                          Minimal 10 karakter required
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{submitError}</p>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit}
                    className="w-full px-4 py-3 bg-sigap-primary text-white rounded-lg font-semibold disabled:opacity-50 hover:bg-sigap-primaryHover transition-colors"
                  >
                    {submitting
                      ? "Mengirim..."
                      : syncStatus === "syncing"
                      ? "Menyinkronkan..."
                      : isOnline()
                      ? "Kirim Verifikasi"
                      : "Simpan Offline"}
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVerdict("confirmed");
                        setReason("Kerusakan benar ada dan sesuai dengan deskripsi.");
                      }}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      Terima
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerdict("needs_clarification")}
                      className="px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors"
                    >
                      Minta Klarifikasi
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVerdict("rejected");
                        setReason("");
                      }}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {offlineQueue.length > 0 && syncStatus !== "queued" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800">
                      {offlineQueue.length} Verifikasi Offline
                    </p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Verifikasi Anda akan dikirim otomatis saat koneksi tersedia.
                    </p>
                    {isOnline() && (
                      <button
                        onClick={syncOfflineQueue}
                        className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 underline"
                      >
                        Kirim sekarang
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowTutorial(!showTutorial)}
                className="w-full text-left p-4 bg-white rounded-lg border border-sigap-border flex items-center justify-between"
              >
                <span className="font-semibold text-sm">Panduan Verifikasi</span>
                <span className="text-sigap-textMuted">{showTutorial ? "▲" : "▼"}</span>
              </button>

              {showTutorial && (
                <div className="mt-2 p-4 bg-white rounded-lg border border-sigap-border space-y-4">
                  <section>
                    <h3 className="text-sm font-bold mb-2 text-sigap-primary">Cara Verifikasi</h3>
                    <ol className="text-xs text-sigap-textSecondary space-y-2 list-decimal list-inside">
                      <li>Periksa lokasi dan bandingkan dengan deskripsi</li>
                      <li>Centang checklist item yang sesuai</li>
                      <li>Pilih keputusan yang tepat</li>
                      <li>Kirim verifikasi</li>
                    </ol>
                  </section>

                  <section className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h3 className="text-sm font-bold text-green-800 mb-2">Konfirmasi</h3>
                    <ul className="text-xs text-green-700 space-y-1">
                      <li>Kerusakan sesuai deskripsi</li>
                      <li>Masih belum diperbaiki</li>
                      <li>Foto bukti valid</li>
                    </ul>
                  </section>

                  <section className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h3 className="text-sm font-bold text-red-800 mb-2">Tolak</h3>
                    <ul className="text-xs text-red-700 space-y-1">
                      <li>Lokasi tidak sesuai</li>
                      <li>Sudah diperbaiki</li>
                      <li>Duplikat atau tidak valid</li>
                    </ul>
                  </section>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
