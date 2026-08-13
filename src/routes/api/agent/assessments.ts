import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { getAssessments, getAssessmentTrace } from "@/lib/agent/store";

export const agentAssessmentsRoute = new Hono<{ Bindings: Env }>();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

agentAssessmentsRoute.get(
  "/:report_id",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN", "ADMIN_DAERAH", "AUDITOR"),
  safeHandler(async (c) => {
    const reportId = c.req.param("report_id");

    if (!UUID_REGEX.test(reportId)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid report_id UUID is required" } }, 400);
    }

    const assessments = await getAssessments(c.env, reportId);

    return c.json({ assessments });
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
