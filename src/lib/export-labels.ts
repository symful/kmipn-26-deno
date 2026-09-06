const labels: Record<string, string> = {
  submitted: "Diterima",
  under_review: "Dalam peninjauan",
  verified: "Terverifikasi",
  assigned: "Ditugaskan",
  in_progress: "Sedang ditangani",
  resolved: "Selesai",
  rejected: "Ditolak",
  needs_info: "Perlu informasi",
  needs_completion: "Perlu perbaikan",
  merged: "Digabungkan",
  closed: "Ditutup",
  low: "Ringan",
  medium: "Sedang",
  high: "Berat",
  needs_survey: "Perlu survei",
  needs_clarification: "Perlu klarifikasi",
  duplicate: "Duplikat",
  out_of_scope: "Di luar cakupan",
  valid: "Valid",
  accepted: "Diterima",
  completed: "Pekerjaan selesai",
  draft: "Draf",
  separated: "Dipisahkan",
  duplicate_merged: "Duplikat digabungkan",
  pending_clarification: "Menunggu klarifikasi",
  ringan: "Ringan",
  sedang: "Sedang",
  berat: "Berat",
  critical: "Kritis",
};
export const exportLabel = (value: unknown): string =>
  value == null || value === ""
    ? "Belum ditetapkan"
    : (labels[String(value)] ?? "Tidak dikenali");
export const exportSeverity = (value: unknown): string =>
  value != null && /^\d+(?:\.\d+)?$/.test(String(value))
    ? `${value}/100`
    : exportLabel(value);

/** SQLite's unmarked timestamps represent UTC. Export dates explicitly identify WIB. */
export function exportDate(value: unknown): string {
  if (!value) return "";
  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    raw,
  )
    ? raw.replace(" ", "T") + "Z"
    : raw;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return raw;
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date) + " WIB"
  );
}
