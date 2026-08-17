import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { redactPII } from "@/lib/csv-redaction";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const exportPdfRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const PAGE_SIZE = 1000;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

interface ReportRow {
  id: string;
  created_at: Date;
  status: string;
  severity: string;
  priority: string;
  category_name: string;
  wilayah_name: string;
  description: string;
  updated_at: Date;
}

async function buildPdf(rows: ReportRow[], filters: Record<string, string>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const titleFontSize = 18;
  const bodyFontSize = 9;
  const smallFontSize = 8;

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const titleColor = rgb(0.1, 0.2, 0.4);
  const headerBg = rgb(0.2, 0.3, 0.5);
  const headerText = rgb(1, 1, 1);
  const bodyAlt = rgb(0.95, 0.95, 0.95);
  const borderColor = rgb(0.8, 0.8, 0.8);
  const textColor = rgb(0.1, 0.1, 0.1);
  const mutedColor = rgb(0.4, 0.4, 0.4);

  const colWidths = [
    contentWidth * 0.08,
    contentWidth * 0.12,
    contentWidth * 0.15,
    contentWidth * 0.10,
    contentWidth * 0.08,
    contentWidth * 0.08,
    contentWidth * 0.14,
    contentWidth * 0.13,
    contentWidth * 0.12,
  ];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  const rowHeight = 20;
  const headerHeight = 24;
  const filterSectionHeight = 60;

  let currentPage = 0;
  let yPosition = pageHeight - margin;

  function addPage() {
    const page = doc.addPage([pageWidth, pageHeight]);
    currentPage++;
    yPosition = pageHeight - margin;
    return page;
  }

  function drawHeader(page: { drawText: (text: string, options: object) => void; drawRectangle: (options: object) => void }) {
    yPosition -= titleFontSize + 10;
    page.drawText("SIGAP Laporan", {
      x: margin,
      y: yPosition,
      size: titleFontSize,
      font: boldFont,
      color: titleColor,
    });

    yPosition -= smallFontSize + 5;
    const dateStr = new Date().toISOString().slice(0, 10);
    page.drawText(`Dicetak: ${dateStr}`, {
      x: margin,
      y: yPosition,
      size: smallFontSize,
      font,
      color: mutedColor,
    });

    yPosition -= smallFontSize + 5;
    const filterLines: string[] = [];
    if (filters.status) filterLines.push(`Status: ${filters.status}`);
    if (filters.category_id) filterLines.push(`Kategori: ${filters.category_id}`);
    if (filters.wilayah_id) filterLines.push(`Wilayah: ${filters.wilayah_id}`);
    if (filters.from) filterLines.push(`Dari: ${filters.from}`);
    if (filters.to) filterLines.push(`Sampai: ${filters.to}`);
    if (filterLines.length > 0) {
      page.drawText(`Filter: ${filterLines.join(" | ")}`, {
        x: margin,
        y: yPosition,
        size: smallFontSize,
        font,
        color: mutedColor,
      });
    }

    yPosition -= filterSectionHeight;
  }

  function drawTableHeader(page: { drawText: (text: string, options: object) => void; drawRectangle: (options: object) => void }) {
    const headers = ["ID", "Dibuat", "Kategori", "Status", "Severity", "Prioritas", "Wilayah", "Update", "Deskripsi"];
    let x = margin;
    const headerY = yPosition - headerHeight + 6;

    page.drawRectangle({
      x: margin,
      y: yPosition - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: headerBg,
    });

    for (let i = 0; i < headers.length; i++) {
      const colWidth = colWidths[i] ?? 0;
      const hdr = headers[i] ?? "";
      page.drawText(hdr, {
        x: x + 2,
        y: headerY,
        size: bodyFontSize - 1,
        font: boldFont,
        color: headerText,
      });
      x += colWidth;
    }
    yPosition -= headerHeight;
  }

  function truncateText(text: string, maxWidth: number, fontSize: number): string {
    const avgCharWidth = fontSize * 0.5;
    const maxChars = Math.floor(maxWidth / avgCharWidth);
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 3) + "...";
  }

  function drawRow(page: { drawText: (text: string, options: object) => void; drawRectangle: (options: object) => void }, row: ReportRow, isAlt: boolean) {
    if (yPosition - rowHeight < margin + 30) return false;

    const createdDate = row.created_at ? new Date(row.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "";
    const updatedDate = row.updated_at ? new Date(row.updated_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "-";

    const values = [
      row.id.slice(0, 8),
      createdDate,
      truncateText(row.category_name || "-", colWidths[2] ?? 0, bodyFontSize),
      row.status,
      row.severity,
      row.priority || "-",
      truncateText(row.wilayah_name || "-", colWidths[6] ?? 0, bodyFontSize),
      updatedDate,
      truncateText(redactPII(row.description || "-").replace(/\n/g, " "), colWidths[8] ?? 0, bodyFontSize),
    ];

    let x = margin;
    const textY = yPosition - rowHeight + 6;

    if (isAlt) {
      page.drawRectangle({
        x: margin,
        y: yPosition - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: bodyAlt,
      });
    }

    page.drawRectangle({
      x: margin,
      y: yPosition - rowHeight,
      width: tableWidth,
      height: rowHeight,
      borderColor,
      borderWidth: 0.5,
    });

    for (let i = 0; i < values.length; i++) {
      const val = values[i] ?? "";
      const colWidth = colWidths[i] ?? 0;
      page.drawText(val, {
        x: x + 2,
        y: textY,
        size: bodyFontSize,
        font,
        color: textColor,
      });
      x += colWidth;
    }
    yPosition -= rowHeight;
    return true;
  }

  let page = addPage();
  drawHeader(page);

  page.drawText(`Total: ${rows.length} laporan`, {
    x: margin,
    y: yPosition + 5,
    size: smallFontSize,
    font: boldFont,
    color: textColor,
  });
  yPosition -= 5;

  drawTableHeader(page);

  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && i % PAGE_SIZE === 0) {
      page = addPage();
      drawHeader(page);
      page.drawText(`Halaman ${currentPage} (lanjutan)`, {
        x: margin,
        y: yPosition + 5,
        size: smallFontSize,
        font: boldFont,
        color: textColor,
      });
      yPosition -= 5;
      drawTableHeader(page);
    }

    const row = rows[i];
    if (!row) continue;
    if (!drawRow(page, row, i % 2 === 1)) {
      page = addPage();
      drawHeader(page);
      drawTableHeader(page);
      drawRow(page, row, i % 2 === 1);
    }
  }

  const lastPage = doc.getPage(doc.getPageCount() - 1);
  lastPage.drawText(`Generated by SIGAP - Page ${currentPage}`, {
    x: margin,
    y: margin / 2,
    size: smallFontSize,
    font,
    color: mutedColor,
  });

  return doc.save();
}

exportPdfRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    const categoryId = c.req.query("category_id");
    const wilayahId = c.req.query("wilayah_id");
    const from = c.req.query("from");
    const to = c.req.query("to");

    const rows = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (status) { filters.push(`r.status = $${i++}`); params.push(status); }
      if (categoryId) { filters.push(`r.category_id = $${i++}`); params.push(categoryId); }
      if (wilayahId) { filters.push(`r.wilayah_id = $${i++}`); params.push(wilayahId); }
      if (from) { filters.push(`r.created_at >= $${i++}`); params.push(from); }
      if (to) { filters.push(`r.created_at <= $${i++}`); params.push(to); }

      if (user.role !== "ADMIN" && user.wilayah_id) {
        filters.push(`r.wilayah_id = $${i++}`);
        params.push(user.wilayah_id);
      }

      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

      const r = await client.query(
        `SELECT r.id, r.created_at, r.status, r.severity, r.priority,
                c.name AS category_name,
                w.name AS wilayah_name,
                r.description,
                r.updated_at
         FROM reports r
         LEFT JOIN categories c ON c.id = r.category_id
         LEFT JOIN wilayah w ON w.id = r.wilayah_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT ${PAGE_SIZE}`,
        params
      );
      return r.rows;
    });

    const estimatedSize = rows.length * 500;
    if (estimatedSize > MAX_SIZE_BYTES) {
      return c.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Export terlalu besar. Gunakan filter yang lebih spesifik." } },
        413
      );
    }

    const filters: Record<string, string> = {};
    if (status) filters.status = status;
    if (categoryId) filters.category_id = categoryId;
    if (wilayahId) filters.wilayah_id = wilayahId;
    if (from) filters.from = from;
    if (to) filters.to = to;

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildPdf(rows as ReportRow[], filters);
    } catch (err) {
      logger.error({ route: "/api/export/pdf", method: "GET", context: "pdf_generation_failed", error: err as Error });
      return c.json(
        { error: { code: "PDF_GENERATION_FAILED", message: "Gagal menghasilkan PDF" } },
        500
      );
    }

    if (pdfBytes.length > MAX_SIZE_BYTES) {
      return c.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Export terlalu besar. Gunakan filter yang lebih spesifik." } },
        413
      );
    }

    const action = "export_pdf";
    appendAudit(c.env, { activeRole: c.get("user").role,
      actor: c.get("user").sub,
      action,
      objectType: "report_export",
      objectId: `export_${Date.now()}`,
    }).catch((e) => logger.error({ route: "/api/export/pdf", method: "GET", context: "audit_write_failed", action, error: e as Error }));

    const timestamp = new Date().toISOString().slice(0, 10);
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sigap-reports-${timestamp}.pdf"`,
        "Content-Length": String(pdfBytes.length),
      },
    });
  }),
);
