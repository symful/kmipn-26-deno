import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { RefreshTokenSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { signAccessToken, signRefreshToken, verifyToken, isRefreshTokenRevoked, revokeRefreshToken } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/ratelimit";

export const authRefreshRoute = new Hono<{ Bindings: Env }>();
authRefreshRoute.post(
  "/",
  rateLimit({ keyBy: () => "refresh", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = RefreshTokenSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);

    try {
      const payload = await verifyToken(c.env, parsed.data.refresh_token, "refresh");
      const oldJti = payload.jti;
      if (oldJti && await isRefreshTokenRevoked(c.env, oldJti)) {
        return c.json({ error: { code: "TOKEN_REVOKED", message: "Token has been revoked" } }, 401);
      }
      const newJti = crypto.randomUUID();
      const access_token = await signAccessToken(c.env, payload);
      const refresh_token = await signRefreshToken(c.env, { ...payload, jti: newJti });
      if (oldJti && payload.exp) {
        await revokeRefreshToken(c.env, oldJti, new Date(payload.exp * 1000));
      }
      if (c.env.DISABLE_LOGIN_AUDIT !== "true") {
        await appendAudit(c.env, { actor: payload.sub, actorRole: payload.role as string, action: "token_refresh", objectType: "user", objectId: payload.sub, after: { role: payload.role } }).catch((e) => logger.error({ route: "/api/auth/refresh", method: "POST", error: e instanceof Error ? e : new Error(String(e)), context: "audit_write_failed" }));
      }
      return c.json({ access_token, refresh_token, expires_in: 900 });
    } catch {
      return c.json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } }, 401);
    }
  }),
);