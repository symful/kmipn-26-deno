import { displayValue } from "../lib/display-labels";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PageHead } from "../components/ReferencePage";
import { StatusBadge } from "../components/StatusBadge";
import { Modal } from "../components/design-system/Modal";
import { toast } from "../components/Toast";
import type { ReportStatus } from "../types";
import "./queue-parity.css";

type Item = Awaited<ReturnType<typeof api.adminQueue>>["items"][number] & {
  title?: string;
  assessment?: string;
  authenticity_label?: string;
  ai_damage_type?: string;
  duplicates_count?: number;
  radius_meters?: number;
  assessment_status?: string;
};
const tabs = [
  "Semua",
  "Perlu Verifikasi Manusia",
  "Terindikasi Duplikat",
  "Kualitas Media Rendah",
];
const actions = {
  valid: "Terima laporan",
  duplicate: "Gabungkan ke kasus yang sudah ada",
  needs_survey: "Tugaskan pemeriksaan lapangan",
  needs_completion: "Minta kelengkapan laporan",
  rejected: "Tolak Laporan",
};
type Action = keyof typeof actions;

export default function Queue() {
  const [items, setItems] = useState<Item[]>([]),
    [tab, setTab] = useState("Semua");
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [action, setAction] = useState<{ item: Item; kind: Action } | null>(
    null,
  );
  const [reason, setReason] = useState(""),
    [target, setTarget] = useState(""),
    [deadline, setDeadline] = useState("");
  const [units, setUnits] = useState<Array<{ id: string; nama: string }>>([]);
  const [targets, setTargets] = useState<
    Array<{ id: string; title: string; photo_urls: string[] }>
  >([]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .adminQueue({
        page,
        limit: 20,
        assessment:
          (
            {
              Semua: "Semua",
              "Perlu Verifikasi Manusia": "needs_review",
              "Terindikasi Duplikat": "possible_duplicate",
              "Kualitas Media Rendah": "photo_needs_improvement",
            } as Record<string, string>
          )[tab] ?? tab,
      })
      .then((data) => {
        if (active) {
          setItems(data.items);
          setPages(data.pagination.total_pages);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, tab, reload]);
  async function open(item: Item, kind: Action) {
    setAction({ item, kind });
    setReason("");
    setTarget("");
    setTargets([]);
    setUnits([]);
    setDeadline("");
    setError("");
    try {
      if (kind === "needs_survey")
        setUnits(
          (await api.regionalUnits()).items.filter((u) => Boolean(u.is_active)),
        );
      if (kind === "duplicate") {
        const first = await api.reports({
          category_id: item.category_id,
          limit: 100,
        });
        const rest = await Promise.all(
          Array.from(
            {
              length: Math.max(0, Math.ceil(first.pagination.total / 100) - 1),
            },
            (_, i) =>
              api.reports({
                category_id: item.category_id,
                limit: 100,
                page: i + 2,
              }),
          ),
        );
        setTargets(
          [...first.data, ...rest.flatMap((page) => page.data)]
            .filter(
              (r) =>
                r.id !== item.id &&
                !r.merged_into &&
                !["merged", "closed", "rejected", "separated"].includes(
                  r.status,
                ),
            )
            .map((r) => ({
              id: r.id,
              title: r.title || r.description.slice(0, 60),
              photo_urls: r.photo_urls,
            })),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      if (action.kind === "duplicate")
        await api.combineCases(action.item.id, {
          target_case_id: target,
          reason,
        });
      else
        await api.decideCase(action.item.id, {
          decision: action.kind,
          reason,
          ...(action.kind === "needs_survey"
            ? {
                assigned_unit_id: target,
                ...(deadline
                  ? { deadline: new Date(deadline).toISOString() }
                  : {}),
              }
            : {}),
        });
      setAction(null);
      setReload((n) => n + 1);
      toast.success("Keputusan tersimpan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function assess() {
    setBusy(true);
    setError("");
    try {
      const item =
        items.find((i) => i.assessment_status !== "completed") ?? items[0];
      if (item) {
        const request = {
          report_id: item.id,
          idempotency_key: crypto.randomUUID(),
        };
        const result = await api.assess(request);
        toast.success(
          result.overall_status === "completed"
            ? "Analisis AI selesai"
            : "Sebagian pemeriksaan belum selesai. Tinjau hasil yang tersedia sebelum menentukan tindak lanjut.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setReload((n) => n + 1);
    }
  }
  return (
    <div className="ref-queue">
      <PageHead
        title="Pemeriksaan laporan masuk"
        subtitle="Cocokkan keluhan pelapor dengan foto dan lokasi, lalu periksa apakah laporan membahas kejadian yang sudah tercatat. Terima laporan yang buktinya memadai, minta kelengkapan jika informasi kurang, atau tugaskan pemeriksaan lapangan bila kondisi belum jelas. Gabungkan laporan hanya setelah kejadian yang sama dipastikan."
        actions={
          <button
            className="ref-button primary"
            disabled={busy || loading || !items.length}
            onClick={assess}
          >
            {busy ? "Memproses…" : "Periksa satu laporan dengan AI"}
          </button>
        }
      />
      <div className="ref-notice" style={{ marginBottom: 18 }}>
        Tombol pemeriksaan memproses satu laporan pada halaman ini: laporan
        pertama yang pemeriksaannya belum selesai. Jika semuanya sudah
        diperiksa, laporan teratas diperiksa ulang. Buka hasilnya untuk melihat
        bukti yang mendukung, perbedaan yang perlu dijelaskan, dan informasi
        yang masih kurang.
      </div>
      <div
        className="ref-queue-tabs"
        role="tablist"
        aria-label="Jenis penilaian"
      >
        {tabs.map((label) => (
          <button
            role="tab"
            aria-selected={tab === label}
            className={tab === label ? "active" : ""}
            key={label}
            onClick={() => {
              setTab(label);
              setPage(1);
            }}
          >
            {displayValue(label)}
          </button>
        ))}
      </div>
      {error && !action && (
        <div className="ref-notice" role="alert">
          {error}{" "}
          <button
            className="ref-button"
            onClick={() => setReload((n) => n + 1)}
          >
            Coba lagi
          </button>
        </div>
      )}
      {loading ? (
        <div className="ref-card">Memuat antrean…</div>
      ) : (
        <div className="ref-grid ref-equal">
          {items.map((item) => (
            <section className="ref-card" key={item.id}>
              <div className="ref-card-head">
                <div>
                  <small className="font-mono">
                    {item.id} · radius {item.radius_meters ?? "—"} m
                    {item.assessment_status === "completed"
                      ? " · AI selesai"
                      : ""}
                  </small>
                  <h2 style={{ marginTop: 7 }}>
                    {item.title || item.description.slice(0, 60)}
                  </h2>
                </div>
                <StatusBadge status={item.status as ReportStatus} />
              </div>
              <div className="ref-queue-gallery">
                {item.photo_urls.length ? (
                  item.photo_urls.slice(0, 3).map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Bukti laporan ${index + 1}`} />
                    </a>
                  ))
                ) : (
                  <div className="ref-queue-no-photo">Belum ada bukti foto</div>
                )}
              </div>
              <div
                className="ref-row"
                style={{
                  margin: "16px 0",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <p
                  className="text-sm"
                  style={{ flexBasis: "100%", margin: "0 0 4px" }}
                >
                  {item.authenticity_label
                    ? displayValue(item.authenticity_label)
                    : "Lokasi dan waktu foto belum diperiksa"}
                </p>
                <span className="ref-queue-badge">
                  {displayValue(item.assessment || "Perlu Verifikasi Manusia")}
                </span>
                {item.assessment_status === "partial" && (
                  <span className="ref-queue-badge">
                    Sebagian pemeriksaan belum selesai
                  </span>
                )}
              </div>
              <p>
                Hasil pemeriksaan foto:{" "}
                {item.ai_damage_type || "belum dapat dinilai"}.{" "}
                {item.duplicates_count == null
                  ? "Perbandingan dengan laporan lain belum tersedia."
                  : item.duplicates_count === 0
                    ? "Tidak ditemukan laporan serupa."
                    : `${item.duplicates_count} laporan serupa perlu dibandingkan sebelum digabungkan.`}
              </p>
              <div className="ref-row" style={{ marginTop: 17 }}>
                {(Object.keys(actions) as Action[]).map((kind) => (
                  <button
                    key={kind}
                    disabled={busy}
                    className={`ref-button ${kind === "valid" ? "primary" : kind === "rejected" ? "danger" : ""}`}
                    onClick={() => open(item, kind)}
                  >
                    {actions[kind]}
                  </button>
                ))}
                <Link className="ref-button" to={`/system/cases/${item.id}`}>
                  Detail ↗
                </Link>
              </div>
            </section>
          ))}
          {!items.length && (
            <div className="ref-card">Tidak ada laporan dalam antrean ini.</div>
          )}
        </div>
      )}
      {pages > 1 && (
        <div className="ref-row" style={{ marginTop: 18 }}>
          <button
            className="ref-button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            className="ref-button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </button>
        </div>
      )}
      <Modal
        open={Boolean(action)}
        size={action?.kind === "duplicate" ? "wide" : "normal"}
        onClose={() => {
          if (!busy) setAction(null);
        }}
      >
        <form
          role="dialog"
          aria-label={action ? actions[action.kind] : "Keputusan laporan"}
          onSubmit={submit}
          style={{ padding: 24, display: "grid", gap: 16, overflowY: "auto" }}
        >
          <h2>{action && actions[action.kind]}</h2>
          <p>{action?.item.title || action?.item.id}</p>
          {(action?.kind === "duplicate" ||
            action?.kind === "needs_survey") && (
            <label>
              {action.kind === "duplicate"
                ? "Kasus tujuan"
                : "Unit penanggung jawab"}
              <select
                aria-label={
                  action.kind === "duplicate"
                    ? "Kasus tujuan"
                    : "Unit penanggung jawab"
                }
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="ref-select"
                style={{ display: "block", width: "100%" }}
              >
                <option value="">Pilih…</option>
                {action.kind === "duplicate"
                  ? targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.id}
                      </option>
                    ))
                  : units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nama}
                      </option>
                    ))}
              </select>
            </label>
          )}
          {action?.kind === "duplicate" && (
            <div
              className="ref-grid ref-equal"
              aria-label="Perbandingan kandidat duplikat"
            >
              {[
                {
                  id: action.item.id,
                  title: action.item.title || action.item.description,
                  photo_urls: action.item.photo_urls,
                },
                targets.find((candidate) => candidate.id === target),
              ].map((candidate, index) => (
                <div key={index}>
                  <h3>
                    {index === 0 ? "Laporan dalam antrean" : "Kasus tujuan"}
                  </h3>
                  <p>
                    {candidate?.title ||
                      "Pilih kasus tujuan untuk membandingkan bukti."}
                  </p>
                  {candidate?.photo_urls[0] ? (
                    <img
                      src={candidate.photo_urls[0]}
                      alt={
                        index === 0
                          ? "Bukti laporan antrean"
                          : "Bukti kasus tujuan"
                      }
                      style={{
                        width: "100%",
                        aspectRatio: "1.8",
                        objectFit: "cover",
                        borderRadius: 8,
                      }}
                    />
                  ) : (
                    <div className="ref-queue-no-photo">
                      Foto belum tersedia
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {action?.kind === "needs_survey" && (
            <label>
              Batas waktu
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="ref-select"
              />
            </label>
          )}
          <label>
            Alasan keputusan
            <textarea
              required
              minLength={1}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="ref-select"
              style={{ display: "block", width: "100%" }}
            />
          </label>
          {error && (
            <div role="alert" className="ref-notice">
              {error}
            </div>
          )}
          <div className="ref-row">
            <button
              className="ref-button"
              type="button"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Batal
            </button>
            <button className="ref-button primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan keputusan"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
