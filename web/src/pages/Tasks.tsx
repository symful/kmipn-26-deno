import type { TaskSummary } from "../api/task-types";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { PageHead } from "../components/ReferencePage";
import { Modal } from "../components/design-system/Modal";
import "./tasks-parity.css";

type Task = TaskSummary;
const tabs = ["Semua Tugas", "Survei Verifikasi", "Perbaikan Fisik"];
const types = ["", "survei_verifikasi", "perbaikan_fisik"];
function photos(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  try {
    return photos(JSON.parse(String(value)));
  } catch {
    return [];
  }
}
export default function Tasks({ reportId }: { reportId?: string } = {}) {
  const user = useAuthStore((s) => s.user);
  const [tasks, setTasks] = useState<Task[]>([]),
    [tab, setTab] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<Task | null>(null),
    [verify, setVerify] = useState(false),
    [progress, setProgress] = useState(0),
    [reason, setReason] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [dialogError, setDialogError] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const result = await api.petugasTasks();
      setTasks(
        (result.data ?? []).filter(
          (task) => !reportId || task.report_id === reportId,
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat tugas");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [reportId]);
  const open = (task: Task, verification = false) => {
    setSelected(task);
    setVerify(verification);
    setProgress(task.progress_percent ?? 0);
    setReason("");
    setFile(null);
    setDialogError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setDialogError("");
    try {
      if (verify)
        await api.verifyCompletion(selected.report_id, {
          decision: "approved",
          reason,
          completion_notes: reason,
        });
      else {
        if (file) {
          if (file.size > 10 * 1024 * 1024)
            throw new Error("Foto maksimal 10 MB");
          const upload = await api.uploadReportPhoto(
            selected.report_id,
            file,
            "task_evidence",
          );
          await api.petugasEvidence(selected.id, {
            photo_urls: [upload.public_url],
            notes: reason,
            role: user?.role === "ADMIN" ? "resolution" : "field",
          });
        }
        await api.petugasProgress(selected.id, {
          progress_percent: progress,
          notes: reason,
        });
      }
      setSelected(null);
      await load();
    } catch (e) {
      setDialogError(
        e instanceof Error ? e.message : "Perubahan gagal disimpan",
      );
    } finally {
      setBusy(false);
    }
  };
  const readonly = selected?.verification_status === "verified";
  return (
    <div className="ref-tasks">
      {!reportId && (
        <PageHead
          title="Tugas & progres lapangan"
          subtitle="Pantau petugas, batas layanan, dan hasil pekerjaan lapangan."
        />
      )}
      <div className="task-tabs" role="tablist">
        {tabs.map((label, index) => (
          <button
            key={label}
            role="tab"
            aria-selected={tab === index}
            onClick={() => setTab(index)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => void load()}>Coba lagi</button>
        </p>
      )}
      <div className="ref-card overflow-x-auto">
        <table className="ref-table">
          <thead>
            <tr>
              {[
                "KODE TUGAS / KASUS",
                "PENANGGUNG JAWAB",
                "BATAS SLA",
                "PROGRES",
                "BUKTI & AKSI",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks
              .filter((task) => !tab || task.task_type === types[tab])
              .map((task) => {
                const done = task.verification_status === "verified";
                return (
                  <tr key={task.id}>
                    <td>
                      <b>{task.id.slice(0, 12)}</b>
                      <p>
                        {task.report_title ||
                          task.report_description ||
                          task.category_name}
                      </p>
                      <Link to={`/system/cases/${task.report_id}`}>
                        {task.report_id.slice(0, 8)} ·{" "}
                        {task.report_address || "Lokasi belum tersedia"}
                      </Link>
                    </td>
                    <td>
                      {task.worker_name ||
                        task.assigned_to_name ||
                        task.unit_name ||
                        "Belum ditetapkan"}
                      {(task.worker_name || task.assigned_to_name) &&
                        task.unit_name && <small>{task.unit_name}</small>}
                      <small>
                        {task.task_type
                          ? tabs[types.indexOf(task.task_type)] ||
                            "Jenis belum ditetapkan"
                          : "Jenis belum ditetapkan"}
                      </small>
                    </td>
                    <td>
                      {task.deadline
                        ? new Date(task.deadline).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                          })
                        : "Belum ditetapkan"}
                      <small>
                        {done
                          ? "Terverifikasi"
                          : task.progress_percent === 100
                            ? "Menunggu verifikasi hasil"
                            : task.deadline &&
                                new Date(task.deadline) < new Date()
                              ? "Terlambat"
                              : ""}
                      </small>
                    </td>
                    <td>
                      <div className="task-progress">
                        <b>
                          {task.progress_percent == null
                            ? "Belum dilaporkan"
                            : `${task.progress_percent}%`}
                        </b>
                        {task.progress_percent != null && (
                          <span>
                            <i
                              style={{
                                width: `${Math.max(0, Math.min(100, task.progress_percent))}%`,
                              }}
                            />
                          </span>
                        )}
                        {done && <em>Selesai</em>}
                      </div>
                    </td>
                    <td>
                      <div className="task-actions">
                        <button
                          className="ref-button"
                          onClick={() => open(task)}
                        >
                          Lihat / Perbarui
                        </button>
                        {task.progress_percent === 100 && !done && (
                          <button
                            className="ref-button primary"
                            onClick={() => open(task, true)}
                          >
                            Verifikasi Hasil
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            {!tasks.filter((task) => !tab || task.task_type === types[tab])
              .length && (
              <tr>
                <td colSpan={5}>
                  {loading ? "Memuat data tugas..." : "Belum ada tugas."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Modal
        open={!!selected}
        onClose={() => !busy && setSelected(null)}
        size="wide"
      >
        <section
          className="task-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={
            verify ? "Verifikasi hasil pekerjaan" : "Laporan lapangan"
          }
        >
          <header>
            <h2>
              {verify
                ? "Verifikasi hasil pekerjaan"
                : `Laporan lapangan · ${selected?.id.slice(0, 12)}`}
            </h2>
            <button
              aria-label="Tutup"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </header>
          <p>
            {selected?.worker_name ||
              selected?.assigned_to_name ||
              selected?.unit_name ||
              "Belum ditetapkan"}{" "}
            · {selected?.report_title || selected?.report_description}
          </p>
          {verify && (
            <p>
              Pastikan bukti pekerjaan telah diperiksa sebelum menutup kasus.
            </p>
          )}
          <div className="task-evidence">
            {[
              ["Bukti laporan warga", photos(selected?.photo_urls)],
              [
                "Bukti petugas lapangan",
                photos(selected?.completion_evidence_urls),
              ],
              [
                "Bukti penanganan admin",
                photos(selected?.resolution_evidence_urls),
              ],
            ].map(([label, urls]) => (
              <div key={String(label)}>
                <h3>{String(label)}</h3>
                {(urls as string[]).length ? (
                  (urls as string[]).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Buka foto ${String(label).toLowerCase()} ukuran penuh`}
                    >
                      <img src={url} alt={String(label)} />
                      <span className="text-xs underline">
                        Lihat foto ukuran penuh
                      </span>
                    </a>
                  ))
                ) : (
                  <div className="task-no-photo">Belum ada foto</div>
                )}
              </div>
            ))}
          </div>
          {readonly ? (
            <p>Hasil pekerjaan telah diverifikasi dan kasus ditutup.</p>
          ) : (
            <form onSubmit={save}>
              {!verify && (
                <>
                  <label>
                    Progres (%)
                    <input
                      aria-label="Progres (%)"
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Foto progres (opsional, maksimal 10 MB)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </>
              )}
              <label>
                Catatan / alasan
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {dialogError && <p role="alert">{dialogError}</p>}
              <footer>
                <button
                  type="button"
                  className="ref-button"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Batal
                </button>
                <button className="ref-button primary" disabled={busy}>
                  {busy
                    ? "Menyimpan..."
                    : verify
                      ? "Verifikasi & tutup kasus"
                      : "Simpan progres"}
                </button>
              </footer>
            </form>
          )}
        </section>
      </Modal>
    </div>
  );
}
