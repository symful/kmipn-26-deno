import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { ReportUpdateSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";

export const reportByIdRoute = new Hono<{ Bindings: Env }>();

reportByIdRoute.get(
  "/:id",
  requireAuth,
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const isAdminOrAuditor = user.role === "ADMIN" || user.role === "AUDITOR";

    const result = await withClient(c.env, async (client) => {
      let query = `SELECT id, idempotency_key, category_id, description, ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat,
                          photo_urls, status, severity, assigned_to, created_at, updated_at
                   FROM reports r WHERE r.id = $1`;
      const params: unknown[] = [id];

      // ADMIN_DAERAH can only read reports in their wilayah; ADMIN/AUDITOR see all
      if (!isAdminOrAuditor && user.wilayah_id) {
        query += ` AND r.wilayah_id = $2`;
        params.push(user.wilayah_id);
      }

      const r = await client.query(query, params);
      return r.rows[0];
    });
    if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
    return c.json(result);
  }),
);

reportByIdRoute.patch(
  "/:id",
  requireAuth,
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const isAdminOrAuditor = user.role === "ADMIN" || user.role === "AUDITOR";
    const body = await c.req.json();
    const parsed = ReportUpdateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" }, details: parsed.error.flatten() }, 400);

    const updated = await withClient(c.env, async (client) => {
      let beforeQuery = `SELECT id, status, description, priority, assigned_to FROM reports WHERE id = $1`;
      const beforeParams: unknown[] = [id];

      if (!isAdminOrAuditor && user.wilayah_id) {
        beforeQuery += ` AND wilayah_id = $2`;
        beforeParams.push(user.wilayah_id);
      }

      const before = await client.query(beforeQuery, beforeParams);
      if (!before.rows[0]) return null;

      const fields: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (parsed.data.status !== undefined) { fields.push(`status = $${i++}`); params.push(parsed.data.status); }
      if (parsed.data.description !== undefined) { fields.push(`description = $${i++}`); params.push(parsed.data.description); }
      if (parsed.data.priority !== undefined) { fields.push(`severity = $${i++}`); params.push(parsed.data.priority); }
      if (parsed.data.assigned_to !== undefined) { fields.push(`assigned_to = $${i++}`); params.push(parsed.data.assigned_to); }
      if (!fields.length) return before.rows[0];

      fields.push(`updated_at = NOW()`);
      params.push(id);
      const r = await client.query(
        `UPDATE reports SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
        params
      );

      await appendAudit(c.env, {
        actor: user.sub,
        action: "report_update",
        objectType: "report",
        objectId: id,
        before: before.rows[0],
        after: r.rows[0],
      }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, error: e, context: "audit_write_failed" }));

      return r.rows[0];
    });

    if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);

    const statusChanged = parsed.data.status !== undefined;
    if (statusChanged) {
      c.executionCtx.waitUntil(
        evaluatePriority(c.env, id).catch((e) =>
          logger.error({ route: c.req.path, method: c.req.method, error: e, context: "priority_calc_failed" })
        )
      );
    }

    return c.json(updated);
  }),
);