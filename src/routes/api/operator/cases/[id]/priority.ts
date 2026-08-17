import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const operatorPriorityRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

operatorPriorityRoute.post("/:id", requireAuth, requireRole("OPERATOR", "ADMIN"), safeHandler(async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: { code: "MISSING_ID", message: "ID is required" } }, 400);

  if (!UUID_REGEX.test(id)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Case ID must be a valid UUID" } }, 400);
  }

  const body = await c.req.json();
  const newScore = typeof body.new_score === "number" ? body.new_score : null;
  const factorBreakdown = typeof body.factor_breakdown === "object" ? body.factor_breakdown : null;
  const reason = String(body.reason ?? "");

  if (newScore === null) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "new_score is required and must be a number" } }, 400);
  }

  if (newScore < 0 || newScore > 100) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "new_score must be between 0 and 100" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const beforeR = await client.query("SELECT id, priority_score FROM reports WHERE id = $1", [id]);
      if (!beforeR.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      const existingScoreR = await client.query(
        "SELECT computed_score, override_score FROM priority_scores WHERE report_id = $1",
        [id]
      );

      if (existingScoreR.rows[0]) {
        await client.query(
          "UPDATE priority_scores SET override_score = $1, override_reason = $2, override_by = $3, overridden_at = NOW() WHERE report_id = $4",
          [newScore, reason, user.sub, id]
        );
      } else {
        await client.query(
          "INSERT INTO priority_scores (report_id, override_score, override_reason, override_by, computed_score) VALUES ($1, $2, $3, $4, $5)",
          [id, newScore, reason, user.sub, newScore]
        );
      }

      const afterR = await client.query(
        "SELECT COALESCE((SELECT override_score FROM priority_scores WHERE report_id = $1), (SELECT computed_score FROM priority_scores WHERE report_id = $1)) AS priority_score",
        [id]
      );

      await client.query(
        `INSERT INTO case_events (report_id, event_type, actor_id, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          id,
          "priority_override",
          user.sub,
          JSON.stringify({
            old_priority: beforeR.rows[0].priority_score,
            new_priority: newScore,
            reason: reason,
          }),
        ]
      );

      await client.query("COMMIT");

      return {
        before: beforeR.rows[0],
        after: afterR.rows[0],
        new_score: newScore,
        factor_breakdown: factorBreakdown,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Case not found" } }, 404);

  await auditReportChange(c.env, user.sub, id, "operator_priority_override", result.before, result.after, reason);

  try {
    await evaluatePriority(c.env, id);
  } catch (e) {
    logger.error({ route: c.req.path, method: c.req.method, error: e instanceof Error ? e : new Error(String(e)), context: "priority_calc_failed" });
    return c.json(
      {
        error: {
          code: "PRIORITY_CALCULATION_FAILED",
          message: "Priority override saved, but automated priority calculation failed. Please retry.",
        },
      },
      500
    );
  }

  return c.json({ status: "priority_updated", new_score: result.new_score, priority_score: result.after.priority_score });
}));
