import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { getAssessments, getAllAssessments, getAssessmentTrace } from "@/lib/agent/store";

export const agentAssessmentsRoute = new Hono<{ Bindings: Env }>();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

agentAssessmentsRoute.get(
  "/",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN", "ADMIN_DAERAH", "AUDITOR"),
  safeHandler(async (c) => {
    const reportId = c.req.query("reportId");
    const modelVersion = c.req.query("model_version");

    if (reportId && !UUID_REGEX.test(reportId)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid reportId UUID is required" } }, 400);
    }

    try {
      const assessments = await getAllAssessments(c.env, reportId, modelVersion);
      return c.json({ assessments });
    } catch (error) {
      return c.json({ assessments: [] });
    }
  }),
);

agentAssessmentsRoute.get(
  "/:reportId",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN", "ADMIN_DAERAH", "AUDITOR"),
  safeHandler(async (c) => {
    const reportId = c.req.param("reportId");
    const modelVersion = c.req.query("model_version");

    if (!UUID_REGEX.test(reportId)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid reportId UUID is required" } }, 400);
    }

    try {
      const assessments = await getAssessments(c.env, reportId, modelVersion);
      return c.json({ assessments });
    } catch (error) {
      return c.json({ assessments: [] });
    }
  }),
);

agentAssessmentsRoute.get(
  "/trace/:id",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN", "ADMIN_DAERAH", "AUDITOR"),
  safeHandler(async (c) => {
    const assessmentId = c.req.param("id");

    if (!UUID_REGEX.test(assessmentId)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid assessment id UUID is required" } }, 400);
    }

    const assessment = await getAssessmentTrace(c.env, assessmentId);

    if (!assessment) {
      return c.json({ error: { code: "NOT_FOUND", message: "Assessment not found" } }, 404);
    }

    return c.json({ assessment });
  }),
);

agentAssessmentsRoute.post(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "OPERATOR", "VERIFIKATOR"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ error: { code: "MISSING_ID" } }, 400);

    const { runAssessment } = await import("@/lib/agent/orchestrator");
    c.executionCtx.waitUntil(runAssessment(c.env, id).catch((e) => console.error(e)));

    return c.json({ status: "assessment_started", report_id: id });
  }),
);
