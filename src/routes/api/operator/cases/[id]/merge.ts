import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

const TERMINAL_STATES = ["closed", "rejected", "merged", "separated", "resolved", "duplicate_merged"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const operatorMergeRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

operatorMergeRoute.post("/:id", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  const body = await c.req.json();
  const targetCaseIds = Array.isArray(body.target_case_ids) ? body.target_case_ids : [];
  const reason = String(body.reason ?? "");

  if (targetCaseIds.length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "target_case_ids must contain at least one case ID" } }, 400);
  }

  for (const cid of targetCaseIds) {
    if (!UUID_REGEX.test(String(cid))) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "All case IDs must be valid UUIDs" } }, 400);
    }
  }

  if (!UUID_REGEX.test(id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Source case ID must be a valid UUID" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const sourceR = await client.query("SELECT id, status FROM reports WHERE id = $1", [id]);
      if (!sourceR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const sourceStatus = sourceR.rows[0].status as string;
      if (TERMINAL_STATES.includes(sourceStatus as typeof TERMINAL_STATES[number])) {
        await client.query("COMMIT");
        return { invalidTransition: true, current: sourceStatus };
      }

      const targetIds = [...targetCaseIds];
      for (const targetId of targetIds) {
        const targetR = await client.query("SELECT id, status FROM reports WHERE id = $1", [targetId]);
        if (!targetR.rows[0]) {
          await client.query("ROLLBACK");
          return { targetNotFound: true, id: targetId };
        }
        const targetStatus = targetR.rows[0].status as string;
        if (TERMINAL_STATES.includes(targetStatus as typeof TERMINAL_STATES[number])) {
          await client.query("COMMIT");
          return { invalidTransition: true, current: targetStatus, id: targetId };
        }
      }

      const mergedInto = targetIds[0];
      const others = targetIds.slice(1);

      await client.query(
        "UPDATE reports SET status = 'duplicate_merged', merged_into = $1, updated_at = NOW() WHERE id = $2",
        [mergedInto, id]
      );

      for (const otherId of others) {
        await client.query(
          "UPDATE reports SET status = 'merged', merged_into = $1, updated_at = NOW() WHERE id = $2",
          [mergedInto, otherId]
        );
      }

      const afterR = await client.query("SELECT id, status, merged_into FROM reports WHERE id = $1", [id]);
      await client.query("COMMIT");

      return {
        before: { id, status: sourceStatus },
        after: afterR.rows[0],
        merged_case_ids: [id, ...targetIds],
        primary_case_id: mergedInto,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Source case not found" } }, 404);
  if ("targetNotFound" in result) return c.json({ error: { code: "NOT_FOUND", message: `Target case ${result.id} not found` } }, 404);
  if (result.invalidTransition) {
    return c.json({ error: { code: "INVALID_TRANSITION", message: `Cannot merge a case in '${result.current}' state` } }, 409);
  }

  await auditReportChange(c.env, user.sub, id, "report_merge", result.before, result.after, reason);

  try {
    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO outbox (event_type, target_system, payload, related_report_id)
         VALUES ($1, 'satu_data', $2, $3)`,
        ["operator_merge", JSON.stringify({ report_id: id, action: "operator_merge", merged_case_ids: result.merged_case_ids, reason, merged_by: user.sub }), id]
      );
    });
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "outbox_insert_failed" });
  }

  return c.json({ status: "merged", primary_case_id: result.primary_case_id, merged_case_ids: result.merged_case_ids });
}));
