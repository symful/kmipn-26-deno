import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { RegisterVerifikatorSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { requireAuth, hashPassword, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export const registerVerifikatorRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
registerVerifikatorRoute.post(
  "/",
  rateLimit({ keyBy: () => "register-verifikator", limit: 5, windowMs: 60_000 }),
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");

    const body = await c.req.json();
    const parsed = RegisterVerifikatorSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);

    const password_hash = await hashPassword(parsed.data.password);
    try {
      const inserted = await withClient(c.env, async (client: PgClient) => {
        const r = await client.query(
          `INSERT INTO users (email, password_hash, name, role, wilayah_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'VERIFIKATOR', $4, NOW(), NOW()) RETURNING id, email, role`,
          [parsed.data.email, password_hash, parsed.data.name, parsed.data.wilayah_id ?? null]
        );
        return r.rows[0];
      });
      await appendAudit(c.env, {
        actor: user.sub,
        action: "user_create",
        objectType: "user",
        objectId: inserted.id,
        after: { email: parsed.data.email, role: "VERIFIKATOR" },
      }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "user_create", err: e }));

      return c.json(inserted, 201);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return c.json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Email already registered" } }, 409);
      }
      throw e;
    }
  }),
);