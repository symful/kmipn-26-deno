import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  PDFString,
} from "pdf-lib";
import type { PdfReportRow } from "./report-pdf";
import type { ExportAssessment, ExportJson } from "./export-data";
import { value } from "./export-narrative";
import { exportDate, exportLabel } from "./export-labels";
import { auditActionLabel } from "./audit-labels";
import { redactPII } from "./csv-redaction";

const record = (v: ExportJson): { [key: string]: ExportJson } =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};
function finding(a: ExportAssessment): string[] {
  if (!["completed", "success"].includes(a.status)) return [];
  const r = record(a.result);
  switch (a.kind) {
    case "extract_damage_indicators":
      return r.damage_visible === true
        ? [
            `Foto memperlihatkan ${value(r.damage_label ?? r.damage_type ?? "kerusakan")}${r.severity ? ` (${value(r.severity)})` : ""}.`,
            ...(r.damage_description &&
            !/^Kerusakan teridentifikasi:.*(?:Tingkat keparahan|Tingkat kerusakan)/i.test(
              String(r.damage_description),
            )
              ? [value(r.damage_description)]
              : []),
          ]
        : r.damage_visible === false
          ? ["Pemeriksaan foto tidak mengenali kerusakan."]
          : [];
    case "classify_problem":
      return r.category_name || r.category
        ? [
            `Uraian mengarah pada kategori ${value(r.category_name ?? r.category!)}.`,
            ...(r.rationale ? [value(r.rationale)] : []),
          ]
        : [];
    case "find_duplicates": {
      const count =
        typeof r.duplicate_count === "number" ? r.duplicate_count : null;
      return count && count > 0
        ? [
            `Pemeriksaan menemukan ${count} laporan serupa; admin perlu membandingkan bukti sebelum menggabungkannya.`,
          ]
        : [];
    }
    case "assess_location_time_consistency":
      return r.distance_meters == null
        ? [
            "Data foto belum cukup untuk memastikan lokasi pengambilan. Admin perlu mengonfirmasi lokasi.",
          ]
        : [
            `Lokasi foto berjarak ${r.distance_meters} meter dari titik laporan.${typeof r.time_delta_hours === "number" ? ` Waktunya berselisih ${r.time_delta_hours} jam.` : " Waktu foto belum dapat dibandingkan."}`,
          ];
    case "assess_completeness":
      return r.complete === false
        ? [
            `Pelapor perlu melengkapi ${value(r.missing_fields ?? "data laporan")}.`,
          ]
        : [];
    case "assess_media_quality":
      return r.quality_ok === false
        ? ["Foto belum cukup jelas; admin perlu meminta foto pengganti."]
        : [];
    case "detect_privacy_risk":
      return r.pii_detected === true
        ? [
            `Bukti memuat kemungkinan data pribadi${r.pii_types ? ` (${value(r.pii_types)})` : ""}; admin perlu memeriksanya sebelum publikasi.`,
          ]
        : [];
    default:
      return [];
  }
}

function checklistLines(input: ExportJson): string[] {
  if (Array.isArray(input)) return input.flatMap(checklistLines);
  if (!input || typeof input !== "object") return input ? [value(input)] : [];
  const item = input.item ?? input.label ?? input.name;
  if (!item) return [value(input)];
  const state =
    input.checked === true || input.status === "completed"
      ? "petugas sudah memeriksa"
      : input.checked === false
        ? "petugas belum memeriksa"
        : input.status === "in_progress"
          ? "petugas sedang memeriksa"
          : "";
  const rest = Object.fromEntries(
    Object.entries(input).filter(
      ([k, v]) =>
        ![
          "item",
          "label",
          "name",
          "checked",
          "status",
          "required",
          "id",
        ].includes(k) &&
        v !== null &&
        v !== "",
    ),
  );
  return [
    `${value(item)}${state ? " - " + state : ""}${Object.keys(rest).length ? ". " + value(rest) : ""}.`,
  ];
}

function details(r: PdfReportRow, links: Map<string, string>): string[][] {
  const photoCounts = new Map<string, number>();
  const evidence = (url: string, kind: string) => {
    const n = (photoCounts.get(kind) ?? 0) + 1;
    photoCounts.set(kind, n);
    const label = /^https?:\/\//i.test(url)
      ? `${kind} ${n} (buka foto)`
      : `${kind} ${n}: ${url}`;
    links.set(label, url);
    return label;
  };
  const location = [
    r.title || "Laporan fasilitas",
    `No. ${r.id}`,
    r.category_name,
    r.address_area || "Laporan belum mencantumkan alamat.",
    ...(r.lat != null && r.lng != null ? [`GPS: ${r.lat}, ${r.lng}`] : []),
    redactPII(r.description),
    ...(r.impact_dampak ? [`Dampak: ${r.impact_dampak}`] : []),
    ...(r.population_affected != null
      ? [`${r.population_affected} warga terdampak.`]
      : []),
  ];
  const findings = [...new Set((r.assessments ?? []).flatMap(finding))];
  const followup: string[] = [];
  for (const task of r.tasks ?? []) {
    const who = task.worker_name ?? task.assigned_to_name ?? task.unit_name;
    followup.push(
      `${who ?? "Tugas " + task.id}: ${exportLabel(task.status)}${task.progress_percent != null ? ` (${task.progress_percent}%)` : ""}.`,
    );
    if (task.instructions) followup.push(task.instructions);
    if (task.progress_notes)
      followup.push(`Perkembangan: ${task.progress_notes}`);
    for (const visit of task.visits) {
      findings.push(
        `Kunjungan ${exportDate(visit.created_at)}${visit.worker_name ? " / " + visit.worker_name : ""}.`,
      );
      if (visit.findings) findings.push(value(visit.findings));
      if (visit.checklist) findings.push(...checklistLines(visit.checklist));
      for (const url of visit.photo_urls)
        findings.push(evidence(url, "Foto kunjungan"));
    }
    for (const url of task.completion_evidence_urls)
      followup.push(evidence(url, "Foto penyelesaian"));
  }
  for (const d of r.decisions ?? []) {
    followup.push(
      `${exportDate(d.created_at)} - ${auditActionLabel(d.action)}${d.actor_name ? " / " + d.actor_name : ""}.`,
    );
    if (d.reason) followup.push(d.reason);
    const after = record(d.after);
    for (const key of [
      "completion_notes",
      "reason",
      "rejection_reason",
      "notes",
      "instructions",
    ])
      if (after[key] && after[key] !== d.reason)
        followup.push(value(after[key]));
  }
  if (r.rejection_reason && !followup.includes(r.rejection_reason))
    followup.push(`Alasan penolakan: ${r.rejection_reason}`);
  if (r.merged_into)
    followup.push(`Laporan mengikuti penanganan pada nomor ${r.merged_into}.`);
  for (const url of r.photo_urls ?? [])
    location.push(evidence(url, "Foto pelapor"));
  const priority = [
    exportLabel(r.status),
    r.priority != null
      ? `Prioritas ${r.priority}/100`
      : "Admin belum menetapkan prioritas.",
    `Masuk: ${exportDate(r.created_at)}`,
    `Pembaruan: ${exportDate(r.updated_at)}`,
  ];
  const p = r.priority_details;
  if (p?.override_reason)
    priority.push(`Alasan prioritas: ${p.override_reason}`);
  if (p?.override_score != null)
    priority.push(
      `Nilai perhitungan ${p.computed_score}; admin menetapkan ${p.override_score}.`,
    );
  if (r.deadline) priority.push(`Batas waktu: ${exportDate(r.deadline)}`);
  return [
    location,
    findings.length
      ? findings
      : ["Belum ada temuan pemeriksaan yang menjelaskan kondisi fasilitas."],
    followup.length
      ? followup
      : ["Belum ada penugasan atau keputusan tindak lanjut."],
    priority,
  ];
}

/** A tabular working report keeps location, evidence, actions and priority adjacent. */
export async function renderCaseDossiers(
  rows: PdfReportRow[],
  filters: Record<string, string>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("SIGAP - Rekap pemeriksaan dan tindak lanjut");
  doc.setAuthor("SIGAP");
  const font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89,
    H = 595.28,
    M = 28,
    CW = W - 2 * M,
    widths = [235, 225, 205, CW - 665],
    ink = rgb(0.13, 0.18, 0.17),
    teal = rgb(0.04, 0.24, 0.21),
    muted = rgb(0.36, 0.42, 0.41),
    line = rgb(0.81, 0.87, 0.85);
  let page = doc.addPage([W, H]),
    y = 0;
  const safe = (v: unknown) =>
    [
      ...String(v ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    ]
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  function wrap(
    input: unknown,
    width: number,
    size = 8.5,
    face: PDFFont = font,
  ): string[] {
    const text = safe(input),
      out: string[] = [];
    let current = "";
    for (const word of text.split(" ")) {
      if (
        face.widthOfTextAtSize(current ? current + " " + word : word, size) <=
        width
      ) {
        current = current ? current + " " + word : word;
        continue;
      }
      if (current) {
        out.push(current);
        current = "";
      }
      for (const c of word) {
        if (face.widthOfTextAtSize(current + c, size) > width && current) {
          out.push(current);
          current = "";
        }
        current += c;
      }
    }
    if (current) out.push(current);
    return out;
  }
  function header() {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: teal });
    page.drawText("SIGAP / Rekap pemeriksaan dan tindak lanjut", {
      x: M,
      y: H - 34,
      size: 18,
      font: bold,
      color: teal,
    });
    page.drawText(
      `${rows.length} laporan / Ekspor ${exportDate(new Date().toISOString())}`,
      { x: M, y: H - 51, size: 8, font, color: muted },
    );
    const scope = [
      filters.status ? exportLabel(filters.status) : "Semua status",
      filters.category_id || "Semua kategori",
      filters.from ? "Mulai " + filters.from : "",
      filters.to ? "Sampai " + filters.to : "",
    ]
      .filter(Boolean)
      .join(" / ");
    page.drawText(safe(scope), {
      x: M,
      y: H - 65,
      size: 8,
      font,
      color: muted,
    });
    y = H - 80;
    page.drawRectangle({ x: M, y: y - 26, width: CW, height: 26, color: teal });
    let x = M;
    [
      "LOKASI DAN LAPORAN",
      "TEMUAN DAN BUKTI",
      "KEPUTUSAN DAN TINDAK LANJUT",
      "STATUS DAN PRIORITAS",
    ].forEach((title, i) => {
      page.drawText(title, {
        x: x + 8,
        y: y - 16,
        size: 7,
        font: bold,
        color: rgb(1, 1, 1),
      });
      x += widths[i]!;
    });
    y -= 26;
  }
  function next() {
    page = doc.addPage([W, H]);
    header();
  }
  header();
  if (!rows.length)
    page.drawText("Tidak ada laporan yang memenuhi pilihan ekspor.", {
      x: M + 10,
      y: y - 28,
      size: 11,
      font,
      color: ink,
    });
  rows.forEach((r, index) => {
    const links = new Map<string, string>();
    const cells = details(r, links).map((texts, i) =>
      texts.flatMap((text, j) => [
        ...wrap(text, widths[i]! - 16),
        ...(j < texts.length - 1 ? [""] : []),
      ]),
    );
    let offset = 0,
      total = Math.max(...cells.map((c) => c.length));
    while (offset < total) {
      if (y < 95) next();
      if (offset > 0) {
        page.drawText(`Lanjutan laporan ${r.id}`, {
          x: M + 8,
          y: y - 12,
          size: 8,
          font: bold,
          color: teal,
        });
        y -= 20;
      }
      const count = Math.min(total - offset, Math.floor((y - 53 - 16) / 11.5));
      if (count < 1) {
        next();
        continue;
      }
      const height = count * 11.5 + 16;
      if (index % 2 === 0)
        page.drawRectangle({
          x: M,
          y: y - height,
          width: CW,
          height,
          color: rgb(0.95, 0.97, 0.96),
        });
      let x = M;
      cells.forEach((cell, c) => {
        cell.slice(offset, offset + count).forEach((text, j) => {
          const baseline = y - 14 - j * 11.5;
          const url = links.get(text);
          page.drawText(text, {
            x: x + 8,
            y: baseline,
            size: 8.5,
            font: c === 0 && offset + j === 0 ? bold : font,
            color: url ? teal : ink,
          });
          if (url && /^https?:\/\//i.test(url)) {
            const annotation = doc.context.register(
              doc.context.obj({
                Type: "Annot",
                Subtype: "Link",
                Rect: [x + 8, baseline - 2, x + widths[c]! - 8, baseline + 10],
                Border: [0, 0, 0],
                A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
              }),
            );
            page.node.addAnnot(annotation);
          }
        });
        page.drawLine({
          start: { x, y },
          end: { x, y: y - height },
          color: line,
          thickness: 0.5,
        });
        x += widths[c]!;
      });
      page.drawLine({
        start: { x: M + CW, y },
        end: { x: M + CW, y: y - height },
        color: line,
        thickness: 0.5,
      });
      page.drawLine({
        start: { x: M, y: y - height },
        end: { x: M + CW, y: y - height },
        color: line,
        thickness: 0.5,
      });
      y -= height;
      offset += count;
      if (offset < total) next();
    }
  });
  doc.getPages().forEach((p, i) => {
    p.drawText(
      "SIGAP / Nilai prioritas membantu mengurutkan penanganan, bukan menunjukkan persentase kerusakan.",
      { x: M, y: 25, size: 7, font, color: muted },
    );
    p.drawText(`${i + 1} / ${doc.getPageCount()}`, {
      x: W - M - 40,
      y: 25,
      size: 8,
      font: bold,
      color: teal,
    });
  });
  return doc.save();
}
