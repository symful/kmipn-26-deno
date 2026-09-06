import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { RefreshTokenSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import { verifyToken, revokeRefreshToken } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";

export const authLogoutRoute = new Hono<{ Bindings: Env }>();
authLogoutRoute.post(
  "/",
  safeHandler(async (c) => {
    const { refresh_token } = await parseJson(c, RefreshTokenSchema);

    try {
      const payload = await verifyToken(c.env, refresh_token, "refresh");
      if (payload.jti && payload.exp) {
        try {
          await revokeRefreshToken(
            c.env,
            payload.jti,
            new Date(payload.exp * 1000),
          );
        } catch (e) {
          logger.error({
            route: "/api/auth/logout",
            method: "POST",
            context: "revoke_token_error",
            error: e instanceof Error ? e : new Error(String(e)),
          });
          return c.json(
            {
              error: {
                code: "REVOCATION_FAILED",
                message: "Failed to revoke token",
              },
            },
            500,
          );
        }
      }
      if (c.env.DISABLE_LOGIN_AUDIT !== "true") {
        c.executionCtx.waitUntil(
          appendAudit(c.env, {
            activeRole: c.get("user").role,
            actor: payload.sub,
            actorRole: payload.role as string,
            action: "logout",
            objectType: "user",
            objectId: payload.sub,
            reason: "refresh_token_revoked",
          }).catch((e) =>
            logger.error({
              route: "/api/auth/logout",
              method: "POST",
              error: e instanceof Error ? e : new Error(String(e)),
              context: "audit_write_failed",
            }),
          ),
        );
      }
      return c.json({ success: true });
    } catch {
      return c.json(
        { error: { code: "INVALID_TOKEN", message: "Token verifikasi gagal" } },
        401,
      );
    }
  }),
);
