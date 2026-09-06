import type { Env } from "@/types/bindings";

const KIND_TITLE_MAP: Record<string, string> = {
  task_completed: "Tugas Selesai",
  report_resolved: "Laporan Selesai",
  report_escalated: "Laporan Dieskalsasi",
  report_assigned: "Laporan Ditugaskan",
};

export interface NotificationInput {
  userId: string;
  kind: string;
  title: string;
  body: string;
  relatedCaseId?: string | undefined;
  relatedReportId?: string | undefined;
}

export async function sendNotification(
  env: Env,
  userId: string,
  kind: string,
  message: string,
  relatedReportId?: string,
  route?: string,
  method?: string,
  title?: string,
): Promise<void> {
  const input: NotificationInput = {
    userId,
    kind,
    title: title ?? KIND_TITLE_MAP[kind] ?? kind,
    body: message,
    relatedReportId,
  };
  const notificationId = crypto.randomUUID();
  await env.D1.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body, related_report_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      notificationId,
      input.userId,
      input.kind,
      input.title,
      input.body,
      input.relatedReportId ?? null,
      new Date().toISOString(),
    )
    .run();
}
