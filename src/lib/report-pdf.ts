import type { ReportExportRow } from "./export-data";
import { renderCaseDossiers } from "./report-pdf-dossier";

export interface PdfReportRow extends Partial<
  Omit<ReportExportRow, "severity">
> {
  id: string;
  title?: string;
  created_at: string;
  status: string;
  severity: string | number | null;
  priority: number | null;
  category_name: string;
  description: string;
  updated_at: string;
}

export async function renderReportPdf(
  rows: PdfReportRow[],
  filters: Record<string, string>,
): Promise<Uint8Array> {
  return renderCaseDossiers(rows, filters);
}
