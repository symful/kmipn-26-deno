import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

const TERMINAL_STATES = ["closed", "rejected", "merged", "separated", "resolved", "duplicate_merged"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const operatorSeparateRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

operatorSeparateRoute.post("/:id", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  if (!UUID_REGEX.test(id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Case ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const reportIdsToSeparate = Array.isArray(body.report_ids_to_separate) ? body.report_ids_to_separate : [];
  const reason = String(body.reason ?? "");

  if (reportIdsToSeparate.length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "report_ids_to_separate must contain at least one report ID" } }, 400);
  }

  for (const rid of reportIdsToSeparate) {
    if (!UUID_REGEX.test(String(rid))) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "All report IDs must be valid UUIDs" } }, 400);
    }
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const sourceR = await client.query("SELECT id, status, category_id, geom, photo_urls FROM reports WHERE id = $1", [id]);
      if (!sourceR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const sourceStatus = sourceR.rows[0].status as string;
      if (TERMINAL_STATES.includes(sourceStatus as typeof TERMINAL_STATES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: sourceStatus };
      }

      const newCaseIds: string[] = [];
      for (const reportId of reportIdsToSeparate) {
        const targetR = await client.query("SELECT id, status FROM reports WHERE id = $1", [reportId]);
        if (!targetR.rows[0]) {
          await client.query("ROLLBACK");
          return { targetNotFound: true, id: reportId };
        }
        const targetStatus = targetR.rows[0].status as string;
        if (TERMINAL_STATES.includes(targetStatus as typeof TERMINAL_STATES[number])) {
          await client.query("COMMIT");
          return { invalidTransition: true, current: targetStatus, id: reportId };
        }
      }

      await client.query(
        "UPDATE reports SET status = 'separated', separated_into = $1, updated_at = NOW() WHERE id = $2",
        [id, id]
      );

      const newR = await client.query<{ id: string }>(
        `INSERT INTO reports (idempotency_key, category_id, description, geom, status, created_at, updated_at, photo_urls)
         SELECT gen_random_uuid(), category_id, 'Separated from case: ' || $1, geom, 'submitted', NOW(), NOW(), photo_urls
         FROM reports WHERE id = $2
         RETURNING id`,
        [id, id]
      );
      newCaseIds.push(newR.rows[0]!.id);

      const afterR = await client.query("SELECT id, status, separated_into FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");

      return {
        before: { id, status: sourceStatus },
        after: afterR.rows[0],
        new_case_ids: newCaseIds,
        separated_report_ids: reportIdsToSeparate,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Case not found" } }, 404);
  if ("targetNotFound" in result) return c.json({ error: { code: "NOT_FOUND", message: `Report ${result.id} not found` } }, 404);
  if (result.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot separate a case in '${result.current}' state` } }, 409);
  }

  await auditReportChange(c.env, user.sub, id, "operator_separate", result.before, result.after, reason);

  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, 'satu_data', $2, $3)`,
        ["operator_separate", JSON.stringify({ report_id: id, action: "operator_separate", new_case_ids: result.new_case_ids, reason, separated_by: user.sub }), id]
      );
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
  }

  c.executionCtx.waitUntil(
    evaluatePriority(c.env, id).catch((e) =>
      logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
    )
  );

  return c.json({ status: "separated", new_case_ids: result.new_case_ids, separated_report_ids: result.separated_report_ids });
}));
