import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { hashPassword, signAccessToken, signRefreshToken } from "@/lib/auth";
import { withClient, type PgClient } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

const RegisterWargaSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  name: z.string().min(1).max(255),
});

export const registerWargaRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
registerWargaRoute.post(
  "/",
  rateLimit({ keyBy: () => "register-warga", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = RegisterWargaSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const { email, password, name } = parsed.data;

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
      return c.json({
        error: { code: "INTERNAL_ERROR", message: "Failed to process password" },
      }, 500);
    }

    try {
      const inserted = await withClient(c.env, async (client: PgClient) => {
        const r = await client.query(
          `INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
           VALUES ($1, $2, $3, 'WARGA', NOW(), NOW())
           RETURNING id, email, role`,
          [email, password_hash, name]
        );
        return r.rows[0];
      });

      if (!inserted.id || !inserted.email || !inserted.role) {
        return c.json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create user",
          },
        }, 500);
      }

      const jti = crypto.randomUUID();

      let access_token: string;
      let refresh_token: string;
      try {
        access_token = await signAccessToken(c.env, {
          sub: inserted.id,
          role: "WARGA",
          wilayah_id: null,
          email: inserted.email,
        });
        refresh_token = await signRefreshToken(c.env, {
          sub: inserted.id,
          role: "WARGA",
          wilayah_id: null,
          email: inserted.email,
          jti,
        });
      } catch (tokenErr) {
        logger.error({
          route: "/api/auth/register",
          method: "POST",
          error: tokenErr instanceof Error ? tokenErr : new Error(String(tokenErr)),
          context: "token_signing_failed",
          user_id: inserted.id,
        });
        return c.json({
          error: {
            code: "TOKEN_ERROR",
            message: "Failed to generate authentication tokens. User was created but login may fail.",
          },
        }, 500);
      }

      return c.json({
        id: inserted.id,
        email: inserted.email,
        role: inserted.role,
        access_token,
        refresh_token,
      }, 201);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return c.json({
          error: { code: "EMAIL_ALREADY_EXISTS", message: "Email already registered" },
        }, 409);
      }
      return c.json({ error: { code: "INTERNAL_ERROR", message: msg } }, 500);
    }
  }),
);
