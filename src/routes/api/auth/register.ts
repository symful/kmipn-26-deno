import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { RegisterWargaSchema } from "@/lib/schemas";
import { parseJson } from "@/lib/validation";
import { safeHandler } from "@/lib/safeHandler";
import { hashPassword, signAccessToken, signRefreshToken } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/id";

interface InsertedUserRow {
  id: string;
  email: string;
  role: string;
}

export const registerWargaRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
registerWargaRoute.post(
  "/",
  rateLimit({ keyBy: () => "register-warga", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const { email, password, name } = await parseJson(c, RegisterWargaSchema);

    let password_hash: string;
    try {
      password_hash = await hashPassword(password);
    } catch (hashErr) {
      logger.error({
        route: "/api/auth/register",
        method: "POST",
        error: hashErr instanceof Error ? hashErr : new Error(String(hashErr)),
        context: "password_hash_failed",
      });
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to process password",
          },
        },
        500,
      );
    }

    const userId = generateId();
    const now = new Date().toISOString();

    try {
      const result = await c.env.D1.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'WARGA', ?, ?)`,
      )
        .bind(userId, email, password_hash, name, now, now)
        .run();

      if (!result.success) {
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to create user",
            },
          },
          500,
        );
      }

      const inserted =
        (await c.env.D1.prepare(
          "SELECT id, email, role FROM users WHERE id = ?",
        )
          .bind(userId)
          .first<InsertedUserRow>()) ?? null;

      if (!inserted || !inserted.id || !inserted.email || !inserted.role) {
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to create user",
            },
          },
          500,
        );
      }

      const jti = crypto.randomUUID();

      let access_token: string;
      let refresh_token: string;
      try {
        access_token = await signAccessToken(c.env, {
          sub: inserted.id,
          role: "WARGA",
          email: inserted.email,
        });
        refresh_token = await signRefreshToken(c.env, {
          sub: inserted.id,
          role: "WARGA",
          email: inserted.email,
          jti,
        });
      } catch (tokenErr) {
        logger.error({
          route: "/api/auth/register",
          method: "POST",
          error:
            tokenErr instanceof Error ? tokenErr : new Error(String(tokenErr)),
          context: "token_signing_failed",
          user_id: inserted.id,
        });
        return c.json(
          {
            error: {
              code: "TOKEN_ERROR",
              message:
                "Failed to generate authentication tokens. User was created but login may fail.",
            },
          },
          500,
        );
      }

      return c.json(
        {
          id: inserted.id,
          email: inserted.email,
          role: inserted.role,
          access_token,
          refresh_token,
        },
        201,
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (
        msg.includes("UNIQUE") ||
        msg.includes("duplicate") ||
        msg.includes("unique")
      ) {
        return c.json(
          {
            error: {
              code: "EMAIL_ALREADY_EXISTS",
              message: "Email already registered",
            },
          },
          409,
        );
      }
      return c.json({ error: { code: "INTERNAL_ERROR", message: msg } }, 500);
    }
  }),
);
