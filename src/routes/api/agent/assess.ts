import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { AgentAssessRequestSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { rateLimit } from "@/lib/ratelimit";
import { runAssessment } from "@/lib/agent/orchestrator";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { getAssessments, getAggregatedAssessment } from "@/lib/agent/store";

export const agentAssessRoute = new Hono<{ Bindings: Env }>();

agentAssessRoute.post(
  "/",
  rateLimit({
    limit: 10,
    windowMs: 60_000,
    keyBy: (c) => c.req.header("Authorization") ?? "anon",
  }),
  safeHandler(async (c) => {
    const user = c.get("user");

    const body = await c.req.json();
    const parsed = AgentAssessRequestSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );

    const reportExists = await c.env.D1.prepare(
      "SELECT id FROM reports WHERE id = ?",
    )
      .bind(parsed.data.report_id)
      .first();
    if (!reportExists) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }

    if (parsed.data.idempotency_key) {
      const existing = await c.env.D1.prepare(
        `SELECT id, idempotency_key
         FROM agent_assessments
         WHERE report_id = ? AND idempotency_key = ? AND assessment_status = 'completed'
         LIMIT 1`,
      )
        .bind(parsed.data.report_id, parsed.data.idempotency_key)
        .first();
      if (existing) {
        logger.info({
          route: c.req.path,
          method: c.req.method,
          context: "idempotency_hit",
          report_id: parsed.data.report_id,
          idempotency_key: parsed.data.idempotency_key,
        });
        const assessments = await getAssessments(c.env, parsed.data.report_id);
        const aggregated = await getAggregatedAssessment(
          c.env,
          parsed.data.report_id,
        );
        return c.json({
          report_id: parsed.data.report_id,
          overall_status: aggregated?.assessment_status ?? "failed",
          cached: true,
          assessments,
          aggregated,
        });
      }
    }

    let summary;
    try {
      summary = await runAssessment(c.env, parsed.data.report_id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({
        route: c.req.path,
        method: c.req.method,
        context: "assess_route_runAssessment_error",
        report_id: parsed.data.report_id,
        error: err instanceof Error ? err : new Error(errorMsg),
      });
      return c.json(
        {
          error: {
            code: "ASSESSMENT_FAILED",
            message: `Assessment failed: ${errorMsg.slice(0, 200)}`,
          },
        },
        500,
      );
    }

    if (summary.overall_status === "failed") {
      return c.json(
        {
          ...summary,
          error: {
            code: "ASSESSMENT_FAILED",
            message:
              "Assessment could not be completed. Please retry from the assessment button.",
          },
        },
        503,
      );
    }
    if (parsed.data.idempotency_key) {
      await c.env.D1.prepare(
        "UPDATE agent_assessments SET idempotency_key = ? WHERE report_id = ?",
      )
        .bind(parsed.data.idempotency_key, parsed.data.report_id)
        .run();
    }

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "ai_assessment",
        objectType: "report",
        objectId: parsed.data.report_id,
        after: summary,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    return c.json({
      ...summary,
      assessments: await getAssessments(c.env, parsed.data.report_id),
      aggregated: await getAggregatedAssessment(c.env, parsed.data.report_id),
    });
  }),
);
