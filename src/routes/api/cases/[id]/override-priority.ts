import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { z } from "zod";

const OverridePrioritySchema = z.object({
  override_score: z
    .number()
    .int()
    .min(0)
    .max(100, "override_score must be between 0 and 100"),
  reason: z.string().min(1, "reason is required"),
});

function scoreToBucket(score: number): string {
  if (score < 30) return "rendah";
  if (score < 60) return "sedang";
  if (score < 80) return "tinggi";
  return "kritis";
}

export const casesOverridePriorityRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesOverridePriorityRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id)
      return c.json(
        { error: { code: "MISSING_ID", message: "ID is required" } },
        400,
      );

    const { override_score, reason } = await parseJson(
      c,
      OverridePrioritySchema,
    );

    const reportExists = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string }>();
    if (!reportExists) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }

    const beforeR = await c.env.D1.prepare(
      "SELECT COALESCE((SELECT override_score FROM priority_scores WHERE report_id = ?), (SELECT computed_score FROM priority_scores WHERE report_id = ?)) AS priority_score",
    )
      .bind(id, id)
      .first<{ priority_score: number | null }>();

    const existingScoreR = await c.env.D1.prepare(
      "SELECT computed_score FROM priority_scores WHERE report_id = ?",
    )
      .bind(id)
      .first<{ computed_score: number | null }>();

    const statements: D1PreparedStatement[] = [];

    const now = new Date().toISOString();

    if (existingScoreR) {
      statements.push(
        c.env.D1.prepare(
          "UPDATE priority_scores SET override_score = ?, override_reason = ?, override_by = ?, override_at = ? WHERE report_id = ?",
        ).bind(override_score, reason, user.sub, now, id),
      );
    } else {
      statements.push(
        c.env.D1.prepare(
          "INSERT INTO priority_scores (report_id, override_score, override_reason, override_by, override_at, computed_score) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(id, override_score, reason, user.sub, now, override_score),
      );
    }

    statements.push(
      c.env.D1.prepare(
        `INSERT INTO case_events (id, report_id, event_type, actor_id, metadata)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)`,
      ).bind(
        id,
        "priority_override",
        user.sub,
        JSON.stringify({
          old_priority: beforeR?.priority_score ?? 0,
          new_priority: override_score,
          reason,
        }),
      ),
    );

    await c.env.D1.batch(statements);

    const priority_bucket = scoreToBucket(override_score);

    const afterR = await c.env.D1.prepare(
      "SELECT COALESCE((SELECT override_score FROM priority_scores WHERE report_id = ?), (SELECT computed_score FROM priority_scores WHERE report_id = ?)) AS priority_score",
    )
      .bind(id, id)
      .first<{ priority_score: number }>();

    const reportR = await c.env.D1.prepare(
      "SELECT status FROM reports WHERE id = ?",
    )
      .bind(id)
      .first<{ status: string }>();

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        "admin_priority_override",
        { priority_score: beforeR?.priority_score },
        { priority_score: afterR?.priority_score },
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

    return c.json({
      id,
      status: reportR?.status ?? null,
      priority_score: override_score,
      priority_bucket,
      override_reason: reason,
      override_applied_at: now,
    });
  }),
);
