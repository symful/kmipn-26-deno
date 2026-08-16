import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";

export const operatorQueueCountsRoute = new Hono<{ Bindings: Env }>();

operatorQueueCountsRoute.get("/", requireAuth, requireRole("OPERATOR", "ADMIN", "ADMIN_DAERAH"), safeHandler(async (c) => {
  const user = c.get("user");

  const counts = await withClient(c.env, async (client) => {
    const { sql: newReportsSql, params: newReportsParams } = applyWilayahFilter(
      "SELECT COUNT(*)::int as cnt FROM reports WHERE status = 'submitted'",
      [],
      user.wilayah_id,
    );
    const newReports = await client.query(newReportsSql, newReportsParams);

    const { sql: needsVerificationSql, params: needsVerificationParams } = applyWilayahFilter(
      "SELECT COUNT(*)::int as cnt FROM reports WHERE status = 'under_review'",
      [],
      user.wilayah_id,
    );
    const needsVerification = await client.query(needsVerificationSql, needsVerificationParams);

    const { sql: slaBreachedSql, params: slaBreachedParams } = applyWilayahFilter(
      "SELECT COUNT(*)::int as cnt FROM reports WHERE deadline < NOW() AND status NOT IN ('resolved', 'closed')",
      [],
      user.wilayah_id,
    );
    const slaBreached = await client.query(slaBreachedSql, slaBreachedParams);

    const { sql: highPrioritySql, params: highPriorityParams } = applyWilayahFilter(
      "SELECT COUNT(*)::int as cnt FROM reports WHERE priority >= 4",
      [],
      user.wilayah_id,
    );
    const highPriority = await client.query(highPrioritySql, highPriorityParams);

    const { sql: needsCompletionSql, params: needsCompletionParams } = applyWilayahFilter(
      "SELECT COUNT(*)::int as cnt FROM reports WHERE status = 'in_progress'",
      [],
      user.wilayah_id,
    );
    const needsCompletion = await client.query(needsCompletionSql, needsCompletionParams);

    return {
      new_reports: Number(newReports.rows[0]?.cnt ?? 0),
      needs_verification: Number(needsVerification.rows[0]?.cnt ?? 0),
      sla_breached: Number(slaBreached.rows[0]?.cnt ?? 0),
      high_priority: Number(highPriority.rows[0]?.cnt ?? 0),
      needs_completion: Number(needsCompletion.rows[0]?.cnt ?? 0),
    };
  });

  return c.json(counts);
}));
