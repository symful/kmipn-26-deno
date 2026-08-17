import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { verifyToken } from "@/lib/auth";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";

export const rtRwVerifyRoute = new Hono<{ Bindings: Env }>();

// GET handler: validate token via query param, return minimal report data
rtRwVerifyRoute.get("/", safeHandler(async (c) => {
  const token = c.req.query("token");
  const caseId = c.req.query("case_id");

  if (!token) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Missing token query parameter" } }, 400);
  }

  try {
    const payload = await verifyToken(c.env, token, "access");
    if (payload.type !== "access" || payload.role !== "RT_RW") {
      return c.json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } }, 401);
    }

    if (!checkRateLimit(`rt-rw-verify:token:${payload.sub}`, 10, 60 * 1000)) {
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
    }

    if (!caseId) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Missing case_id query parameter" } }, 400);
    }

    const report = await withClient(c.env, async (client) => {
      const r = await client.query(
        `SELECT id, description, geom, photo_urls, status
         FROM reports
         WHERE id = $1`,
        [caseId]
      );
      return r.rows[0];
    });

    if (!report) {
      return c.json({ error: { code: "REPORT_NOT_FOUND", message: "Report not found" } }, 404);
    }

    return c.json({
      id: report.id,
      description: report.description,
      location: report.geom,
      photos: report.photo_urls,
      current_status: report.status,
    });
  } catch {
    return c.json({ error: { code: "INVALID_TOKEN", message: "Token is invalid" } }, 401);
  }
}));

rtRwVerifyRoute.post("/", safeHandler(async (c) => {
  // Accept token via Authorization header (preferred) or fallback to body for backward compat
  const authHeader = c.req.header("Authorization");
  const body = await c.req.json();
  const verificationToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : body.verification_token;
  const reportId = body.report_id;
  const verdict = body.verdict;
  const reason = body.reason;

  const VALID_RT_RW_VERDICTS = [
    "valid",
    "needs_completion",
    "needs_survey",
    "out_of_scope",
    "duplicate",
    "rejected",
  ];

  if (!verificationToken || !reportId || !VALID_RT_RW_VERDICTS.includes(verdict)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);
  }

  try {
    const payload = await verifyToken(c.env, verificationToken, "access");
    if (payload.type !== "access" || payload.role !== "RT_RW") {
      return c.json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } }, 401);
    }
    const before = await withClient(c.env, async (client) => {
      const r = await client.query("SELECT id, status, rt_rw_verdict, rt_rw_token_used_at FROM reports WHERE id = $1", [reportId]);
      return r.rows[0];
    });
    if (!before) return c.json({ error: { code: "REPORT_NOT_FOUND", message: "Report not found" } }, 404);
    if (before.rt_rw_token_used_at) {
      return c.json({ error: { code: "TOKEN_ALREADY_USED", message: "RT/RW token has already been used for this report" } }, 409);
    }

    await withClient(c.env, async (client) => {
      await client.query(
        "UPDATE reports SET rt_rw_verdict = $1, rt_rw_reason = $2, rt_rw_at = NOW(), rt_rw_token_used_at = NOW(), updated_at = NOW() WHERE id = $3",
        [verdict, reason, reportId]
      );
    });

    await appendAudit(c.env, { activeRole: c.get("user").role,
      actor: payload.sub,
      action: "rt_rw_verify",
      objectType: "report",
      objectId: reportId,
      before,
      after: { verdict, reason },
    }).catch((e) => {
      logger.error({ route: c.req.path, method: c.req.method, error: e as Error, context: "audit_write_failed" });
      throw e;
    });

    return c.json({ success: true, report_id: reportId, verdict });
  } catch {
    return c.json({ error: { code: "INVALID_TOKEN", message: "Token is invalid" } }, 401);
  }
}));
