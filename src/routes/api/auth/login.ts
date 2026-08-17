import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { LoginSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { verifyPassword, signAccessToken, signRefreshToken } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { Role } from "@/middleware/roles";
import { logger } from "@/lib/logger";

export const authLoginRoute = new Hono<{ Bindings: Env }>();
authLoginRoute.post(
  "/",
  rateLimit({ keyBy: () => "login", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);

    const user = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        "SELECT id, email, password_hash, name, role, wilayah_id FROM users WHERE email = $1 AND deleted_at IS NULL",
        [parsed.data.email]
      );
      return r.rows[0];
    });

    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash as string))) {
      return c.json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }, 401);
    }

    if (c.env.DISABLE_LOGIN_AUDIT !== "true") {
      const authUser = c.get("user");
      await appendAudit(c.env, { activeRole: authUser ? authUser.role : user.role, actor: user.id as string, actorRole: user.role as string, action: "login", objectType: "user", objectId: user.id as string, after: { email: user.email, role: user.role } }).catch((e) => logger.error({ route: "/api/auth/login", method: "POST", error: e instanceof Error ? e : new Error(String(e)), context: "audit_write_failed" }));
    }

    const jti = crypto.randomUUID();

    if (!user.id || !user.email || !user.role) {
      return c.json({
        error: {
          code: "INTERNAL_ERROR",
          message: "User record has NULL field - data corruption",
          detail: { id: user.id, email: user.email, role: user.role },
        },
      }, 500);
    }

    const access_token = await signAccessToken(c.env, {
      sub: user.id,
      role: user.role as Role,
      wilayah_id: (user.wilayah_id as string | null) ?? null,
      email: user.email,
    });
    const refresh_token = await signRefreshToken(c.env, {
      sub: user.id,
      role: user.role as Role,
      wilayah_id: (user.wilayah_id as string | null) ?? null,
      email: user.email,
      jti,
    });

    return c.json({
      access_token,
      refresh_token,
      expires_in: 900,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, wilayah_id: user.wilayah_id },
    });
  }),
);