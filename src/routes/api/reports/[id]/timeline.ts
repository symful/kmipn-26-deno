import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const reportTimelineHandler = safeHandler(async (c) => {
  const reportId = c.req.param("id");
  if (!reportId) {
    return c.json(
      {
        error: { code: "MISSING_REPORT_ID", message: "Report ID is required" },
      },
      400,
    );
  }

  const rows = await c.env.D1.prepare(
    `SELECT rsh.id, rsh.status, rsh.label, rsh.actor, u.name as actor_name, rsh.occurred_at
     FROM report_status_history rsh
     LEFT JOIN users u ON u.id = rsh.actor
     WHERE rsh.report_id = ?
     ORDER BY rsh.occurred_at ASC`,
  )
    .bind(reportId)
    .all();

  const events = (rows.results ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    label: row.label,
    actor: row.actor,
    actor_name: row.actor_name,
    occurred_at: row.occurred_at,
  }));

  return c.json({ data: events });
});

export const reportTimelineRoute = reportTimelineHandler;
