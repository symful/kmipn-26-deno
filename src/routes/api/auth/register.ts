import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { RegisterSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { hashPassword, signAccessToken, signRefreshToken } from "@/lib/auth";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export const registerRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
registerRoute.post(
  "/",
  rateLimit({ keyBy: () => "register", limit: 5, windowMs: 60_000 }),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);
    }

    const password_hash = await hashPassword(parsed.data.password);
    try {
      const inserted = await withClient(c.env, async (client: PgClient) => {
        const r = await client.query(
          `INSERT INTO users (email, password_hash, name, role, wilayah_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'WARGA', $4, NOW(), NOW()) RETURNING id, email, role`,
          [parsed.data.email, password_hash, parsed.data.name, parsed.data.wilayah_id ?? null]
        );
        return r.rows[0];
      });

      await appendAudit(c.env, { activeRole: c.get("user").role,
        actor: "self",
        action: "user_create",
        objectType: "user",
        objectId: inserted.id,
        after: { email: parsed.data.email, role: "WARGA" },
      }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "user_create", err: e }));

      const jti = crypto.randomUUID();
      const access_token = await signAccessToken(c.env, {
        sub: inserted.id,
        role: "WARGA" as AuthVariables["user"]["role"],
        wilayah_id: parsed.data.wilayah_id ?? null,
        email: parsed.data.email,
      });
      const refresh_token = await signRefreshToken(c.env, {
        sub: inserted.id,
        role: "WARGA" as AuthVariables["user"]["role"],
        wilayah_id: parsed.data.wilayah_id ?? null,
        email: parsed.data.email,
        jti,
      });

      return c.json({
        user: { id: inserted.id, email: inserted.email, role: "WARGA" },
        access_token,
        refresh_token,
      }, 201);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return c.json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Email already registered" } }, 409);
      }
      return c.json({ error: { code: "INTERNAL_ERROR", message: msg } }, 500);
    }
  }),
);
