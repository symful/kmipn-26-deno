import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, signRtRwToken } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient } from "@/lib/db";
import { safeHandler } from "@/lib/safeHandler";

export const generateRtRwTokenRoute = new Hono<{ Bindings: Env }>();

generateRtRwTokenRoute.post("/", requireAuth, requireRole("ADMIN"), safeHandler(async (c) => {
  const body = await c.req.json();
  const reportId = String(body.report_id ?? "");
  const rtRwUserId = String(body.rt_rw_user_id ?? "");
  if (!reportId || !rtRwUserId) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);

  const valid = await withClient(c.env, async (client) => {
    const r = await client.query(
      "SELECT 1 FROM reports WHERE id = $1 AND EXISTS (SELECT 1 FROM users WHERE id = $2 AND role = 'RT_RW')",
      [reportId, rtRwUserId]
    );
    return r.rows.length > 0;
  });
  if (!valid) return c.json({ error: { code: "INVALID_REPORT_OR_USER", message: "Invalid report or user" } }, 404);

  const verification_token = await signRtRwToken(c.env, {
    sub: rtRwUserId,
    role: "RT_RW",
  });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return c.json({
    verification_token,
    expires_at: expiresAt,
    magic_link: `/verify?token=${verification_token}&report_id=${reportId}`,
  });
}));
