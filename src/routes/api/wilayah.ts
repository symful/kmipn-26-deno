import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";

const WilayahCreateSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: z.string().uuid().optional(),
  level: z.enum(["PROVINSI", "KABUPATEN", "KECAMATAN", "DESA"]),
});

const WilayahUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export const wilayahRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

wilayahRoute.get(
  "/",
  safeHandler(async (c) => {
    const parentId = c.req.query("parent_id");
    const rows = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        parentId
          ? "SELECT id, parent_id, level, name FROM wilayah WHERE parent_id = $1 ORDER BY name"
          : "SELECT id, parent_id, level, name FROM wilayah WHERE parent_id IS NULL ORDER BY name",
        parentId ? [parentId] : []
      );
      return r.rows;
    });
    return c.json({ wilayah: rows });
  }),
);

wilayahRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const body = await c.req.json();
    const parsed = WilayahCreateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `INSERT INTO wilayah (name, parent_id, level, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, parent_id, level, name`,
        [parsed.data.name, parsed.data.parent_id ?? null, parsed.data.level]
      );
      return r.rows[0];
    });
    return c.json(result, 201);
  }),
);

wilayahRoute.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = WilayahUpdateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } }, 400);

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (parsed.data.name !== undefined) {
      updates.push(`name = $${i++}`);
      values.push(parsed.data.name);
    }

    if (updates.length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const user = c.get("user");

    const result = await withClient(c.env, async (client: PgClient) => {
      const beforeResult = await client.query(
        "SELECT id, parent_id, level, name, code FROM wilayah WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      const before = beforeResult.rows[0];

      if (!before) return null;

      const r = await client.query(
        `UPDATE wilayah SET ${updates.join(", ")} WHERE id = $${i} AND deleted_at IS NULL RETURNING id, parent_id, level, name, code`,
        values
      );
      const after = r.rows[0];

      await appendAudit(c.env, { activeRole: c.get("user").role,
        actor: user.sub,
        action: "wilayah_update",
        objectType: "wilayah",
        objectId: id,
        before: { name: before.name, code: before.code },
        after: { name: after.name, code: after.code },
      }).catch((e) => logger.error({ route: "/api/wilayah", method: "PATCH", context: "audit_write_failed", action: "wilayah_update", error: e as Error }));

      return after;
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Wilayah not found" } }, 404);
    }

    return c.json(result);
  }),
);

wilayahRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `UPDATE wilayah SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id]
      );
      return r.rows[0];
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Wilayah not found or already deleted" } }, 404);
    }

    return c.json({ success: true });
  }),
);