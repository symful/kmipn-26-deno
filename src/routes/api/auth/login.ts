import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { LoginSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import { safeHandler } from "@/lib/safeHandler";
import { verifyPassword, signAccessToken, signRefreshToken } from "@/lib/auth";
import type { JwtPayload } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import type { Role } from "@/lib/types";
import { logger } from "@/lib/logger";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
}

export const authLoginRoute = new Hono<{ Bindings: Env }>();
authLoginRoute.post(
  "/",
  rateLimit({ keyBy: () => "login", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const { email, password } = await parseJson(c, LoginSchema);

    let user: UserRow | null;
    try {
      user =
        (await c.env.D1.prepare(
          "SELECT id, email, password_hash, name, role FROM users WHERE email = ? AND deleted_at IS NULL",
        )
          .bind(email)
          .first<UserRow>()) ?? null;
    } catch (e) {
      logger.error({
        route: "/api/auth/login",
        method: "POST",
        context: "db_error",
        error: e instanceof Error ? e : new Error(String(e)),
      });
      return c.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        },
        401,
      );
    }

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        },
        401,
      );
    }

    if (c.env.DISABLE_LOGIN_AUDIT !== "true") {
      const authUser = c.get("user");
      c.executionCtx.waitUntil(
        appendAudit(c.env, {
          activeRole: authUser ? authUser.role : user.role,
          actor: user.id,
          actorRole: user.role,
          action: "login",
          objectType: "user",
          objectId: user.id,
          after: { email: user.email, role: user.role },
        }).catch((e) =>
          logger.error({
            route: "/api/auth/login",
            method: "POST",
            error: e instanceof Error ? e : new Error(String(e)),
            context: "audit_write_failed",
          }),
        ),
      );
    }

    const jti = crypto.randomUUID();

    if (!user.id || !user.email || !user.role) {
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "User record has NULL field - data corruption",
            detail: { id: user.id, email: user.email, role: user.role },
          },
        },
        500,
      );
    }

    let access_token: string;
    let refresh_token: string;
    try {
      access_token = await signAccessToken(c.env, {
        sub: user.id,
        role: user.role as JwtPayload["role"],
        roles: [user.role],
        email: user.email,
      });
      refresh_token = await signRefreshToken(c.env, {
        sub: user.id,
        role: user.role as JwtPayload["role"],
        roles: [user.role],
        email: user.email,
        jti,
      });
    } catch (tokenErr) {
      logger.error({
        route: "/api/auth/login",
        method: "POST",
        error:
          tokenErr instanceof Error ? tokenErr : new Error(String(tokenErr)),
        context: "token_signing_failed",
        user_id: user.id,
      });
      return c.json(
        {
          error: {
            code: "TOKEN_ERROR",
            message:
              "Failed to generate authentication tokens. Please try again.",
          },
        },
        500,
      );
    }

    return c.json({
      access_token,
      refresh_token,
      expires_in: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  }),
);
