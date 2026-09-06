import { exportDate, exportLabel, exportSeverity } from "./export-labels";
import type { Env } from "@/types/bindings";
import {
  loadExportReports,
  ExportLimitError,
  type ExportFilters,
  type ReportExportRow,
} from "./export-data";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";
import { labels as detailLabels } from "./export-narrative";

const exportDetailLabels: Record<string, string> = {
  ...detailLabels,
  assigned_to_name: "Petugas yang menerima tugas",
  worker_name: "Petugas pelaksana",
  unit_name: "Unit pelaksana",
  instructions: "Arahan tugas",
  worker_id: "Nomor petugas pelaksana",
  assigned_to: "Nomor penerima tugas",
  task_type: "Jenis tugas",
  accepted_at: "Waktu menerima tugas",
  started_at: "Waktu mulai bekerja",
  completed_at: "Waktu mengirim hasil",
  verified_at: "Waktu pemeriksaan hasil",
  completion_evidence_urls: "Foto penyelesaian",
  visits: "Kunjungan lapangan",
  actor_name: "Pencatat keputusan",
  occurred_at: "Waktu kejadian",
  kind: "Jenis pemeriksaan",
  model_version: "Sumber pemeriksaan",
  rule_version: "Versi aturan",
  correlation_ids: "Referensi pemeriksaan",
  result: "Temuan pemeriksaan",
  computed_at: "Waktu perhitungan",
  config_version: "Versi rumus",
  severity_component: "Komponen kerusakan",
  population_component: "Komponen warga terdampak",
  vulnerability_component: "Komponen kerentanan",
  sla_component: "Komponen batas waktu",
  report_count_component: "Komponen jumlah laporan",
  exif_gps: "Koordinat pada foto",
  consistent: "Kecocokan lokasi dan waktu",
  duplicates_found: "Pemeriksaan menemukan laporan serupa",
  candidates: "Laporan pembanding",
  distance_m: "Jarak antarlokasi (meter)",
  similarity_score: "Nilai kemiripan",
  duplication_level: "Tingkat kemiripan",
  blur_score: "Nilai ketajaman foto",
  authenticity_score: "Nilai perbandingan lokasi dan waktu",
  description: "Uraian",
  details: "Rincian",
  vulnerability_index: "Indeks kerentanan",
};
function csvDetails(input: unknown): string {
  if (input == null) return "";
  if (Array.isArray(input))
    return input.map(csvDetails).filter(Boolean).join("\n\n");
  if (typeof input === "object")
    return Object.entries(input)
      .filter(([, v]) => v != null)
      .map(
        ([key, v]) =>
          `${exportDetailLabels[key] ?? key.replace(/_/g, " ")}: ${key === "status" || key === "old_status" || key === "new_status" ? exportLabel(v) : csvDetails(v)}`,
      )
      .join("\n");
  if (typeof input === "boolean") return input ? "Ya" : "Tidak";
  return String(input);
}

export interface ExportUser {
  role: string;
  sub: string;
}

export function csvEscape(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Escape spreadsheet formulas before CSV quoting, including formulas with commas.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:\.\d+)?$/.test(s)) s = `'${s}`;
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function auditExport(
  env: Env,
  user: ExportUser,
  action: string,
  reason?: string,
) {
  return appendAudit(env, {
    actor: user.sub,
    activeRole: user.role,
    action,
    objectType: "report_export",
    objectId: `export_${Date.now()}`,
    ...(reason ? { reason } : {}),
  }).catch((e) =>
    logger.error({
      route: `exporters/${action}`,
      method: "GET",
      context: "audit_write_failed",
      action,
      error: e as Error,
    }),
  );
}

export type CsvFilters = ExportFilters;
export type GeojsonFilters = ExportFilters;
export type PdfFilters = ExportFilters;
const MAX_BYTES = 10 * 1024 * 1024;
function exportError(message: string, status = 413): Response {
  return Response.json(
    {
      error: {
        code: status === 413 ? "PAYLOAD_TOO_LARGE" : "FORBIDDEN",
        message,
      },
    },
    { status },
  );
}
async function data(
  env: Env,
  filters: ExportFilters,
  user: ExportUser,
  limit: number,
): Promise<ReportExportRow[] | Response> {
  if (!["ADMIN", "PETUGAS", "WARGA"].includes(user.role))
    return exportError("Anda tidak memiliki akses ekspor laporan.", 403);
  try {
    return await loadExportReports(env, filters, user, limit);
  } catch (error) {
    if (error instanceof ExportLimitError) return exportError(error.message);
    throw error;
  }
}
function oversized(body: string): boolean {
  return new TextEncoder().encode(body).length > MAX_BYTES;
}
export async function buildCsv(
  env: Env,
  filters: CsvFilters,
  user: ExportUser,
): Promise<Response> {
  const rows = await data(env, filters, user, 5000);
  if (rows instanceof Response) return rows;
  const headers = [
    "ID laporan",
    "Judul laporan",
    "Waktu laporan (WIB)",
    "Status",
    "Tingkat kerusakan",
    "Jenis fasilitas",
    "Uraian laporan",
    "Alamat lokasi",
    "Lintang (dibulatkan)",
    "Bujur (dibulatkan)",
    "Kondisi menurut pelapor",
    "Dampak",
    "Skor prioritas",
    "Perhitungan dan alasan prioritas",
    "Batas waktu (WIB)",
    "Diverifikasi (WIB)",
    "Diperbarui (WIB)",
    "Alasan penolakan",
    "Referensi foto",
    "Riwayat status",
    "Keputusan dan alasan",
    "Penugasan dan hasil kunjungan",
    "Hasil pemeriksaan AI tersimpan",
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows)
    lines.push(
      [
        r.id,
        r.title,
        exportDate(r.reported_at),
        exportLabel(r.status),
        exportSeverity(r.severity),
        r.category_name,
        r.description,
        r.address_area,
        r.lat?.toFixed(3),
        r.lng?.toFixed(3),
        r.reported_severity,
        csvDetails({
          description: r.impact_dampak,
          details: r.impact,
          population_affected: r.population_affected,
          vulnerability_index: r.vulnerability_index,
        }),
        r.priority,
        csvDetails(r.priority_details),
        exportDate(r.deadline),
        exportDate(r.verified_at),
        exportDate(r.updated_at),
        r.rejection_reason,
        csvDetails(r.photo_urls),
        csvDetails(r.history),
        csvDetails(r.decisions),
        csvDetails(r.tasks),
        csvDetails(r.assessments),
      ]
        .map(csvEscape)
        .join(","),
    );
  const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
  if (oversized(body))
    return exportError(
      "Ekspor terlalu besar. Persempit filter agar seluruh data dapat disertakan.",
    );
  await auditExport(env, user, "export_csv");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reports-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
export async function buildGeojson(
  env: Env,
  filters: GeojsonFilters,
  user: ExportUser,
): Promise<Response> {
  const rows = await data(env, filters, user, 1000);
  if (rows instanceof Response) return rows;
  const features = rows.map((row) => ({
    type: "Feature",
    geometry:
      row.lat !== null && row.lng !== null
        ? { type: "Point", coordinates: [row.lng, row.lat] }
        : null,
    properties: { ...row, thumbnail: row.photo_urls[0] ?? null },
  }));
  const body = JSON.stringify({ type: "FeatureCollection", features }, null, 2);
  if (oversized(body))
    return exportError(
      "Ekspor terlalu besar. Persempit filter agar seluruh data dapat disertakan.",
    );
  await auditExport(env, user, "export_geojson");
  return new Response(body, {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sigap-laporan-${new Date().toISOString().slice(0, 10)}.geojson"`,
    },
  });
}
export async function buildPdfExport(
  env: Env,
  filters: PdfFilters,
  user: ExportUser,
): Promise<Response> {
  const rows = await data(env, filters, user, 1000);
  if (rows instanceof Response) return rows;
  const filterRecord: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters))
    if (value) filterRecord[key] = value;
  if (filters.category_id) {
    const category = await env.D1.prepare(
      "SELECT name FROM categories WHERE id=?",
    )
      .bind(filters.category_id)
      .first<{ name: string }>();
    if (category) filterRecord.category_id = category.name;
  }
  let pdfBytes: Uint8Array;
  try {
    const { renderReportPdf } = await import("./report-pdf");
    pdfBytes = await renderReportPdf(rows, filterRecord);
  } catch (error) {
    logger.error({
      route: "exporters/buildPdf",
      method: "GET",
      context: "pdf_generation_failed",
      error: error as Error,
    });
    return Response.json(
      {
        error: {
          code: "PDF_GENERATION_FAILED",
          message: "Gagal menghasilkan PDF",
        },
      },
      { status: 500 },
    );
  }
  if (pdfBytes.length > MAX_BYTES)
    return exportError(
      "Ekspor terlalu besar. Persempit filter agar seluruh data dapat disertakan.",
    );
  await auditExport(env, user, "export_pdf");
  return new Response(pdfBytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sigap-reports-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Content-Length": String(pdfBytes.length),
    },
  });
}
