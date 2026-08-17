import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient, type PgClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";

const WeightsSchema = z.object({
  severity: z.number().min(0).max(1),
  impact: z.number().min(0).max(1),
  vulnerability: z.number().min(0).max(1),
  sla: z.number().min(0).max(1),
});

const CreateVersionSchema = z.object({
  weights: WeightsSchema,
});

const UpdateVersionSchema = z.object({
  weights: WeightsSchema,
});

export const priorityConfigRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET / — list all versions (paginated)
priorityConfigRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const result = await withClient(c.env, async (client: PgClient) => {
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM priority_formula_versions`
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const r = await client.query(
        `SELECT id, version, weights, is_active, activated_at, activated_by, created_at
         FROM priority_formula_versions
         ORDER BY version DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return { rows: r.rows, total };
    });

    const versions = result.rows.map((row) => ({
      id: row.id,
      version: row.version,
      weights: row.weights,
      is_active: row.is_active,
      activated_at: row.activated_at,
      activated_by: row.activated_by,
      created_at: row.created_at,
    }));

    return c.json({
      data: versions,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(result.total / limit),
      },
    });
  }),
);

// GET /:version — get specific version with weights
priorityConfigRoute.get(
  "/:version",
  requireAuth,
  requireRole("ADMIN", "ADMIN_DAERAH"),
  safeHandler(async (c) => {
    const version = parseInt(c.req.param("version"), 10);
    if (isNaN(version)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid version number" } }, 400);
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      const r = await client.query(
        `SELECT id, version, weights, is_active, activated_at, activated_by, created_at
         FROM priority_formula_versions WHERE version = $1`,
        [version]
      );
      return r.rows[0];
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Priority formula version not found" } }, 404);
    }

    return c.json({
      id: result.id,
      version: result.version,
      weights: result.weights,
      is_active: result.is_active,
      activated_at: result.activated_at,
      activated_by: result.activated_by,
      created_at: result.created_at,
    });
  }),
);

// POST — create new version (auto-increment, deactivated)
priorityConfigRoute.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const body = await c.req.json();
    const parsed = CreateVersionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const { weights } = parsed.data;
    const sum = weights.severity + weights.impact + weights.vulnerability + weights.sla;

    if (Math.abs(sum - 1.0) > 0.001) {
      return c.json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Weights must sum to 1.0, got ${sum}`,
        },
      }, 400);
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      await client.query("BEGIN");
      try {
        const maxVersionResult = await client.query(
          `SELECT COALESCE(MAX(version), 0) as max_version FROM priority_formula_versions`
        );
        const newVersion = (maxVersionResult.rows[0].max_version as number) + 1;

        const r = await client.query(
          `INSERT INTO priority_formula_versions (version, weights, is_active, created_at)
           VALUES ($1, $2, false, NOW())
           RETURNING id, version, weights, is_active, created_at`,
          [newVersion, JSON.stringify(weights)]
        );

        await client.query("COMMIT");
        return r.rows[0];
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    await appendAudit(c.env, {
      actor: admin.sub,
      actorRole: admin.role,
      action: "priority_formula_version_create",
      objectType: "priority_formula_version",
      objectId: result.id,
      after: {
        version: result.version,
        weights: result.weights,
        is_active: result.is_active,
      },
    }).catch((e) => {
      logger.error({ route: "/api/admin/priority-config", method: "POST", context: "audit_write_failed", action: "priority_formula_version_create", error: e as Error });
    });

    return c.json({
      id: result.id,
      version: result.version,
      weights: result.weights,
      is_active: result.is_active,
      created_at: result.created_at,
    }, 201);
  }),
);

// PATCH /:version — update weights (only if not active)
priorityConfigRoute.patch(
  "/:version",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const version = parseInt(c.req.param("version"), 10);
    if (isNaN(version)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid version number" } }, 400);
    }

    const body = await c.req.json();
    const parsed = UpdateVersionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
        details: parsed.error.flatten(),
      }, 400);
    }

    const { weights } = parsed.data;
    const sum = weights.severity + weights.impact + weights.vulnerability + weights.sla;

    if (Math.abs(sum - 1.0) > 0.001) {
      return c.json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Weights must sum to 1.0, got ${sum}`,
        },
      }, 400);
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      await client.query("BEGIN");
      try {
        // Check version exists and is not active
        const existing = await client.query(
          `SELECT id, is_active FROM priority_formula_versions WHERE version = $1`,
          [version]
        );

        if (!existing.rows[0]) {
          await client.query("ROLLBACK");
          return { notFound: true };
        }

        if (existing.rows[0].is_active) {
          await client.query("ROLLBACK");
          return { isActive: true };
        }

        const beforeResult = await client.query(
          `SELECT weights FROM priority_formula_versions WHERE version = $1`,
          [version]
        );

        const r = await client.query(
          `UPDATE priority_formula_versions
           SET weights = $1
           WHERE version = $2
           RETURNING id, version, weights, is_active, created_at`,
          [JSON.stringify(weights), version]
        );

        await client.query("COMMIT");
        return { before: beforeResult.rows[0], after: r.rows[0] };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result.notFound) {
      return c.json({ error: { code: "NOT_FOUND", message: "Priority formula version not found" } }, 404);
    }

    if (result.isActive) {
      return c.json({
        error: {
          code: "FORBIDDEN",
          message: "Cannot update weights of an active version. Activate a different version first.",
        },
      }, 403);
    }

    await appendAudit(c.env, {
      actor: admin.sub,
      actorRole: admin.role,
      action: "priority_formula_version_update",
      objectType: "priority_formula_version",
      objectId: (result.after as { id: string }).id,
      before: { version, weights: (result.before as { weights: unknown }).weights },
      after: { version, weights },
    }).catch((e) => {
      logger.error({ route: "/api/admin/priority-config", method: "PATCH", context: "audit_write_failed", action: "priority_formula_version_update", error: e as Error });
    });

    return c.json({
      id: (result.after as { id: string }).id,
      version: (result.after as { version: number }).version,
      weights: (result.after as { weights: unknown }).weights,
      is_active: (result.after as { is_active: boolean }).is_active,
      created_at: (result.after as { created_at: Date }).created_at,
    });
  }),
);

// POST /:version/activate — set active version (deactivates others)
priorityConfigRoute.post(
  "/:version/activate",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const admin = c.get("user");
    const version = parseInt(c.req.param("version"), 10);
    if (isNaN(version)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid version number" } }, 400);
    }

    const result = await withClient(c.env, async (client: PgClient) => {
      await client.query("BEGIN");
      try {
        // Check version exists
        const existing = await client.query(
          `SELECT id, is_active FROM priority_formula_versions WHERE version = $1`,
          [version]
        );

        if (!existing.rows[0]) {
          await client.query("ROLLBACK");
          return { notFound: true };
        }

        // Deactivate all versions
        await client.query(
          `UPDATE priority_formula_versions SET is_active = false, activated_at = NULL, activated_by = NULL WHERE is_active = true`
        );

        // Activate the selected version
        const r = await client.query(
          `UPDATE priority_formula_versions
           SET is_active = true, activated_at = NOW(), activated_by = $1
           WHERE version = $2
           RETURNING id, version, weights, is_active, activated_at, activated_by, created_at`,
          [admin.sub, version]
        );

        await client.query("COMMIT");
        return r.rows[0];
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result.notFound) {
      return c.json({ error: { code: "NOT_FOUND", message: "Priority formula version not found" } }, 404);
    }

    await appendAudit(c.env, {
      actor: admin.sub,
      actorRole: admin.role,
      action: "priority_formula_version_activate",
      objectType: "priority_formula_version",
      objectId: result.id,
      after: { version: result.version, is_active: result.is_active, activated_at: result.activated_at },
    }).catch((e) => {
      logger.error({ route: "/api/admin/priority-config", method: "POST", context: "audit_write_failed", action: "priority_formula_version_activate", error: e as Error });
    });

    return c.json({
      id: result.id,
      version: result.version,
      weights: result.weights,
      is_active: result.is_active,
      activated_at: result.activated_at,
      activated_by: result.activated_by,
      created_at: result.created_at,
    });
  }),
);
