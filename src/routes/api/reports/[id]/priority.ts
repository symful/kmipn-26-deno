import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { evaluatePriority, getPriorityScore } from "@/lib/priority/calculator";
import { parseJson } from "@/lib/validation";
import { z } from "zod";
import { ID_REGEX } from "@/lib/id";

const PriorityOverrideSchema = z.object({
  score: z.number().int().min(0).max(100, "score must be between 0 and 100"),
  reason: z.string().max(1000).optional(),
  factor_breakdown: z.record(z.string(), z.unknown()).optional(),
});

export const priorityRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

priorityRoute.get(
  "/",
  safeHandler(async (c) => {
    const reportId = c.req.param("id");
    if (!reportId)
      return c.json(
        { error: { code: "MISSING_ID", message: "Report ID is required" } },
        400,
      );
    const exists = await c.env.D1.prepare("SELECT id FROM reports WHERE id = ?")
      .bind(reportId)
      .first();
    if (!exists)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    const result = await getPriorityScore(c.env, reportId);
    if (!result)
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Priority has not been computed",
          },
        },
        404,
      );
    const score = result.total_score;
    return c.json({
      id: reportId,
      version: result.config_version,
      score,
      level:
        score >= 70
          ? "Kritis"
          : score >= 50
            ? "Tinggi"
            : score >= 30
              ? "Sedang"
              : "Rendah",
      inputs: result.inputs,
      breakdown: {
        severity: result.breakdown.severity,
        affected_residents: result.breakdown.impact,
        region_vulnerability: result.breakdown.vulnerability,
        sla_pressure: result.breakdown.sla,
        report_count: result.breakdown.report_count,
      },
    });
  }),
);
priorityRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id)
      return c.json(
        { error: { code: "MISSING_ID", message: "ID is required" } },
        400,
      );

    if (!ID_REGEX.test(id)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "All case IDs must be valid",
          },
        },
        400,
      );
    }

    const { score, reason, factor_breakdown } = await parseJson(
      c,
      PriorityOverrideSchema,
    );

    const reportExists = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string }>();
    if (!reportExists)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        404,
      );

    const beforeR = await c.env.D1.prepare(
      "SELECT report_id AS id, COALESCE(override_score, computed_score) AS priority_score FROM priority_scores WHERE report_id = ?",
    )
      .bind(id)
      .first<{ id: string; priority_score: number | null }>();

    const existingScoreR = await c.env.D1.prepare(
      "SELECT computed_score, override_score FROM priority_scores WHERE report_id = ?",
    )
      .bind(id)
      .first<{ computed_score: number; override_score: number | null }>();

    const statements: ReturnType<typeof c.env.D1.prepare>[] = [];

    if (existingScoreR) {
      statements.push(
        c.env.D1.prepare(
          "UPDATE priority_scores SET override_score = ?, override_reason = ?, override_by = ?, override_at = (datetime('now')) WHERE report_id = ?",
        ).bind(score, reason, user.sub, id),
      );
    } else {
      statements.push(
        c.env.D1.prepare(
          "INSERT INTO priority_scores (report_id, override_score, override_reason, override_by, computed_score) VALUES (?, ?, ?, ?, ?)",
        ).bind(id, score, reason, user.sub, score),
      );
    }

    statements.push(
      c.env.D1.prepare(
        `INSERT INTO case_events (report_id, event_type, actor_id, metadata)
       VALUES (?, ?, ?, ?)`,
      ).bind(
        id,
        "priority_override",
        user.sub,
        JSON.stringify({
          old_priority: beforeR?.priority_score ?? 0,
          new_priority: score,
          reason: reason,
        }),
      ),
    );

    await c.env.D1.batch(statements);

    const afterR = await c.env.D1.prepare(
      "SELECT COALESCE((SELECT override_score FROM priority_scores WHERE report_id = ?), (SELECT computed_score FROM priority_scores WHERE report_id = ?)) AS priority_score",
    )
      .bind(id, id)
      .first<{ priority_score: number }>();

    const result = {
      before: beforeR,
      after: afterR,
      new_score: score,
      factor_breakdown,
    };

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        "admin_priority_override",
        result.before,
        result.after,
        reason,
      ).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_failed",
        }),
      ),
    );

    try {
      await evaluatePriority(c.env, id);
    } catch (e) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: e instanceof Error ? e : new Error(String(e)),
        context: "priority_calc_failed",
      });
      return c.json(
        {
          error: {
            code: "PRIORITY_CALCULATION_FAILED",
            message:
              "Priority override saved, but automated priority calculation failed. Please retry.",
          },
        },
        500,
      );
    }

    return c.json({
      status: "priority_updated",
      new_score: result.new_score,
      priority_score: result.after!.priority_score,
    });
  }),
);
