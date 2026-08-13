import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { evaluatePriority, getPriorityScore } from "@/lib/priority/calculator";

const PriorityOverrideSchema = z.object({
  override_score: z.number().int().min(0).max(100),
  override_reason: z.string().min(10, "override reason must be at least 10 characters"),
});

export const priorityRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

priorityRoute.get(
  "/:id/priority",
  requireAuth,
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const cached = await getPriorityScore(c.env, id);
    if (!cached) {
      const computed = await evaluatePriority(c.env, id);
      if (!computed) {
        return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
      }
      const level = computed.total_score >= 80 ? "Kritis" : computed.total_score >= 60 ? "Tinggi" : computed.total_score >= 40 ? "Sedang" : "Rendah";
      return c.json({
        id,
        version: computed.config_version,
        score: computed.total_score,
        level,
        breakdown: computed.breakdown,
        other_factors: computed.other_factors,
        computed_at: new Date().toISOString(),
      });
    }

    const level = cached.total_score >= 80 ? "Kritis" : cached.total_score >= 60 ? "Tinggi" : cached.total_score >= 40 ? "Sedang" : "Rendah";
    return c.json({
      id,
      version: cached.config_version,
      score: cached.total_score,
      level,
      breakdown: cached.breakdown,
      other_factors: cached.other_factors,
      override_score: cached.override_score,
    });
  }),
);

priorityRoute.put(
  "/:id/priority",
  requireAuth,
  requireRole("OPERATOR", "ADMIN", "PENGAMBIL_KEPUTUSAN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const body = await c.req.json();
    const parsed = PriorityOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const { override_score, override_reason } = parsed.data;

    const result = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const beforeResult = await client.query(
          `SELECT ps.override_score, ps.override_reason, r.severity as report_severity
           FROM priority_scores ps
           JOIN reports r ON r.id = ps.report_id
           WHERE ps.report_id = $1`,
          [id]
        );
        const beforeRow = beforeResult.rows[0];

        const derivedSeverity = Math.min(5, Math.max(1, Math.round((override_score / 100) * 4 + 1)));

        const updateResult = await client.query(
          `UPDATE priority_scores
           SET override_score = $1, override_reason = $2, override_by = $3, override_at = NOW()
           WHERE report_id = $4
           RETURNING *`,
          [override_score, override_reason, user.sub, id]
        );

        if (!updateResult.rows[0]) {
          await client.query("ROLLBACK");
          return { notFound: true };
        }

        await client.query(
          `UPDATE reports SET severity = $1, updated_at = NOW() WHERE id = $2`,
          [derivedSeverity, id]
        );

        await client.query("COMMIT");
        return {
          before: beforeRow,
          after: { override_score, override_reason, report_severity: derivedSeverity },
        };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result.notFound) {
      return c.json({ error: { code: "NOT_FOUND", message: "Report or priority score not found" } }, 404);
    }

    await appendAudit(c.env, {
      actor: user.sub,
      actorRole: user.role,
      action: "priority_override",
      objectType: "report",
      objectId: id,
      before: {
        override_score: result.before?.override_score,
        override_reason: result.before?.override_reason,
        reports_severity: result.before?.report_severity,
      },
      after: {
        override_score,
        override_reason,
        reports_severity: (result.after as { report_severity: number }).report_severity,
      },
      reason: override_reason,
    }).catch((e) => {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "audit_write_failed" });
    });

    return c.json({
      status: "updated",
      report_id: id,
      override_score,
      reports_severity: (result.after as { report_severity: number }).report_severity,
      override_reason,
    });
  }),
);
