import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { RefreshTokenSchema } from "@/lib/schemas";
import { requireAuth, verifyToken, revokeRefreshToken } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

export const authLogoutRoute = new Hono<{ Bindings: Env }>();
authLogoutRoute.post("/", requireAuth, safeHandler(async (c) => {
  const body = await c.req.json();
  const parsed = RefreshTokenSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid refresh_token" } }, 400);

  try {
    const payload = await verifyToken(c.env, parsed.data.refresh_token, "refresh");
    if (payload.jti && payload.exp) revokeRefreshToken(c.env, payload.jti, new Date(payload.exp * 1000));
    if (c.env.DISABLE_LOGIN_AUDIT !== "true") {
      await appendAudit(c.env, { actor: payload.sub, actorRole: payload.role as string, action: "logout", objectType: "user", objectId: payload.sub, reason: "refresh_token_revoked" }).catch((e) => logger.error({ route: "/api/auth/logout", method: "POST", error: e instanceof Error ? e : new Error(String(e)), context: "audit_write_failed" }));
    }
    return c.json({ success: true });
  } catch {
    return c.json({ error: { code: "INVALID_TOKEN", message: "Token verifikasi gagal" } }, 401);
  }
}));
