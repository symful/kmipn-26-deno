import {
  fieldLabels,
  valueLabels as values,
  displayValue as human,
} from "../lib/display-labels";
import { parseServerTimestamp } from "../lib/server-time";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuditLogEntry } from "../types";
import { PageHead } from "../components/ReferencePage";

const timestamp = parseServerTimestamp;
const actionLabels: Record<string, string> = {
  location_metadata_refreshed: "Metadata lokasi diperiksa ulang",
  export_pdf: "Laporan PDF diekspor",
  export_csv: "Data CSV diekspor",
  export_geojson: "Peta GeoJSON diekspor",
  admin_decide_valid: "Laporan dinyatakan valid",
  ai_assessment: "Hasil AI",
  report_create: "Laporan dibuat",
  admin_completion_approved: "Hasil pekerjaan disetujui",
  report_update: "Laporan diperbarui",
  admin_accept: "Laporan diterima admin",
  task_started: "Pekerjaan dimulai",
  visit_submitted: "Hasil kunjungan dikirim",
  petugas_task_complete: "Petugas menyelesaikan tugas",
  notification_mark_read: "Notifikasi dibaca",
  anonymous_report_create: "Laporan publik dibuat",
  photo_uploaded: "Foto diunggah",
  admin_priority_override: "Prioritas diubah admin",
  petugas_task_evidence: "Bukti pekerjaan dikirim",
  petugas_task_progress: "Progres pekerjaan diperbarui",
  admin_decide_needs_survey: "Survei diminta admin",
  priority_formula_version_activate: "Rumus prioritas diaktifkan",
  priority_formula_version_create: "Versi rumus prioritas dibuat",
  report_created: "Laporan dibuat",
  report_updated: "Laporan diperbarui",
  status_changed: "Status diubah",
  report_verified: "Laporan diverifikasi",
  report_assigned: "Laporan ditugaskan",
  task_assigned: "Tugas diberikan",
  task_completed: "Tugas selesai",
  verify_completion: "Hasil pekerjaan diverifikasi",
  task_completion_verified: "Hasil pekerjaan diverifikasi",
  priority_override: "Prioritas diubah",
  report_merged: "Laporan digabungkan",
  login: "Masuk akun",
  logout: "Keluar akun",
};
function decoded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function fields(value: unknown): Record<string, unknown> {
  const data = decoded(value);
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : data == null
      ? {}
      : { nilai: data };
}

function AuditValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const data = decoded(value);
  if (data == null || typeof data !== "object") return <>{human(data)}</>;
  if (Array.isArray(data))
    return (
      <div>
        {data.length} item
        {data.length > 0 && (
          <details>
            <summary>Lihat item</summary>
            <ul className="list-disc pl-4">
              {data.map((item, index) => (
                <li key={index}>
                  <AuditValue value={item} depth={depth + 1} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  const entries = Object.entries(data).filter(
    ([key]) =>
      fieldLabels[key] &&
      ![
        "tool_results",
        "correlation_ids",
        "idempotency_key",
        "device_id",
        "geom",
      ].includes(key),
  );
  if (depth >= 3)
    return <span>Rincian lanjutan tersedia pada catatan teknis.</span>;
  return (
    <div className="space-y-1">
      {entries.slice(0, 3).map(([key, item]) => (
        <div key={key}>
          <span className="font-medium">{fieldLabels[key]}: </span>
          <AuditValue value={item} depth={depth + 1} />
        </div>
      ))}
      {entries.length > 3 && (
        <details>
          <summary>{entries.length - 3} rincian lainnya</summary>
          {entries.slice(3).map(([key, item]) => (
            <div key={key}>
              {fieldLabels[key]}: <AuditValue value={item} depth={depth + 1} />
            </div>
          ))}
        </details>
      )}
      {entries.length === 0 && (
        <span>Rincian tersedia pada catatan teknis.</span>
      )}
    </div>
  );
}
const hiddenFields = new Set([
  "id",
  "idempotency_key",
  "device_id",
  "geom",
  "local_id",
  "ip",
  "tool_results",
]);
function Changes({ before, after }: { before: unknown; after: unknown }) {
  const previous = fields(before),
    next = fields(after);
  const changed = [
    ...new Set([...Object.keys(previous), ...Object.keys(next)]),
  ].filter(
    (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
  );
  const visible = changed.filter(
    (key) => fieldLabels[key] && !hiddenFields.has(key),
  );
  return (
    <div className="space-y-3">
      {visible.length ? (
        <dl className="space-y-3">
          {visible.map((key) => (
            <div key={key} className="rounded border border-sigap-border p-2">
              <dt className="mb-2 text-xs font-semibold">{fieldLabels[key]}</dt>
              <dd className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div className="min-w-0 break-words">
                  <span className="mb-1 block text-[10px] uppercase text-sigap-textMuted">
                    Sebelum
                  </span>
                  <AuditValue value={previous[key]} />
                </div>
                <div className="min-w-0 break-words">
                  <span className="mb-1 block text-[10px] uppercase text-sigap-textMuted">
                    Sesudah
                  </span>
                  <AuditValue value={next[key]} />
                </div>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span>
          {changed.length
            ? "Perubahan administratif tercatat."
            : "Tidak ada perubahan nilai tercatat."}
        </span>
      )}
      {(before != null || after != null) && (
        <details className="text-xs">
          <summary className="cursor-pointer">Rincian teknis</summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-sigap-bg p-2">
            {JSON.stringify(
              { sebelum: decoded(before), sesudah: decoded(after) },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </div>
  );
}
export const Audit = ({ reportId }: { reportId?: string } = {}) => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .auditSearch({ limit: 100, ...(reportId ? { report_id: reportId } : {}) })
      .then(async (first) => {
        const pages = Math.ceil((first.pagination?.total ?? 0) / 100);
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
            api.auditSearch({
              limit: 100,
              page: i + 2,
              ...(reportId ? { report_id: reportId } : {}),
            }),
          ),
        );
        if (active) setEntries([...first.data, ...rest.flatMap((p) => p.data)]);
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat audit");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload, reportId]);
  const rows = entries.filter(
    (entry) =>
      (!search ||
        [
          JSON.stringify(entry),
          actionLabels[entry.action],
          values[entry.actor_role],
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!date ||
        timestamp(entry.created_at).toLocaleDateString("en-CA", {
          timeZone: "Asia/Jakarta",
        }) === date),
  );
  return (
    <div>
      {!reportId && (
        <PageHead
          title="Riwayat aktivitas"
          subtitle="Rekam jejak keputusan operator, alasan, dan perubahan data."
        />
      )}
      <div className="ref-filters">
        <input
          className="ref-input"
          aria-label="Cari log"
          placeholder="Cari pelaksana, tindakan, atau nomor laporan…"
          style={{ width: 360, maxWidth: "100%" }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="ref-input"
          aria-label="Tanggal audit"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <small>{rows.length} aktivitas ditemukan</small>
        <button
          className="ref-button"
          disabled={!search && !date}
          onClick={() => {
            setSearch("");
            setDate("");
          }}
        >
          Hapus filter
        </button>
      </div>
      {error && (
        <div className="ref-notice mb-4" role="alert">
          {error}{" "}
          <button
            className="ref-button"
            onClick={() => setReload((n) => n + 1)}
          >
            Coba lagi
          </button>
        </div>
      )}
      <section className="ref-card ref-table-wrap">
        <table className="ref-table">
          <thead>
            <tr>
              <th>WAKTU / LAPORAN</th>
              <th>PELAKSANA</th>
              <th>TINDAKAN</th>
              <th>PERUBAHAN</th>
              <th>ALASAN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td className="font-mono">
                  {timestamp(entry.created_at).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  WIB<p>{entry.object_id}</p>
                </td>
                <td>
                  {entry.actor}
                  <p>{values[entry.actor_role] ?? "Peran lainnya"}</p>
                </td>
                <td>{actionLabels[entry.action] ?? "Aktivitas tercatat"}</td>
                <td className="ref-audit-diff">
                  <Changes
                    before={entry.before_data}
                    after={entry.after_data}
                  />
                </td>
                <td>
                  <p>{entry.reason || "—"}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <div className="ref-empty">Memuat aktivitas…</div>
        ) : (
          !rows.length && (
            <div className="ref-empty">
              Tidak ada aktivitas sesuai pencarian.
            </div>
          )
        )}
      </section>
      <p
        className="text-[11px] text-sigap-textTertiary"
        style={{ marginTop: 15 }}
      >
        Riwayat keputusan disimpan pada server dan mencatat aktor serta alasan
        perubahan.
      </p>
    </div>
  );
};
