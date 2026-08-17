import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { AgentAssessRequestSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { rateLimit } from "@/lib/ratelimit";
import { runAssessment } from "@/lib/agent/orchestrator";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { getAssessments } from "@/lib/agent/store";
import { withClient } from "@/lib/db";

export const agentAssessRoute = new Hono<{ Bindings: Env }>();

agentAssessRoute.post(
  "/",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN"),
  rateLimit({ limit: 10, windowMs: 60_000, keyBy: (c) => c.req.header("Authorization") ?? "anon" }),
  safeHandler(async (c) => {
    const user = c.get("user");

    const body = await c.req.json();
    const parsed = AgentAssessRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);

    const reportExists = await withClient(c.env, async (client) => {
      const r = await client.query<{ id: string }>("SELECT id FROM reports WHERE id = $1", [parsed.data.report_id]);
      return r.rows[0] !== undefined;
    });
    if (!reportExists) {
      return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
    }

    if (parsed.data.idempotency_key) {
      const existing = await withClient(c.env, async (client) => {
        const r = await client.query<{ id: string; idempotency_key: string }>(
          `SELECT id, idempotency_key
           FROM agent_assessments
           WHERE report_id = $1 AND idempotency_key = $2 AND assessment_status = 'completed'
           LIMIT 1`,
          [parsed.data.report_id, parsed.data.idempotency_key]
        );
        return r.rows[0];
      });
      if (existing) {
        logger.info({ route: c.req.path, method: c.req.method, context: "idempotency_hit", report_id: parsed.data.report_id, idempotency_key: parsed.data.idempotency_key });
        const assessments = await getAssessments(c.env, parsed.data.report_id);
        return c.json({ cached: true, assessments });
      }
    }

    const summary = await runAssessment(c.env, parsed.data.report_id);

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: user.sub,
      action: "ai_assessment",
      objectType: "report",
      objectId: parsed.data.report_id,
      after: summary,
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, error: e, context: "audit_write_failed" }));

    return c.json(summary);
  }),
);
