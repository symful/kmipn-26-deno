import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { generateId } from "@/lib/id";
import { CreatePriorityConfigSchema } from "@/lib/schemas";

export const priorityConfigRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

priorityConfigRoute.get(
  "/",
  safeHandler(async (c) => {
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)),
    );
    const offset = (page - 1) * limit;

    const countResult = await c.env.D1.prepare(
      `SELECT COUNT(*) as total FROM priority_formula_versions`,
    ).first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const r = await c.env.D1.prepare(
      `SELECT id, version, weights, is_active, activated_at, activated_by, created_at
       FROM priority_formula_versions
       ORDER BY version DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all<{
        id: string;
        version: number;
        weights: unknown;
        is_active: boolean;
        activated_at: string | null;
        activated_by: string | null;
        created_at: string;
      }>();

    const versions = (r.results ?? []).map((row) => ({
      id: row.id,
      version: row.version,
      weights:
        typeof row.weights === "string" ? JSON.parse(row.weights) : row.weights,
      is_active: !!row.is_active,
      activated_at: row.activated_at,
      activated_by: row.activated_by,
      created_at: row.created_at,
    }));

    return c.json({
      data: versions,
      pagination: {
        page,
        limit,
        total: total,
        total_pages: Math.ceil(total / limit),
      },
    });
  }),
);

priorityConfigRoute.get(
  "/active",
  safeHandler(async (c) => {
    const result = await c.env.D1.prepare(
      `SELECT id, version, weights, is_active, activated_at, activated_by, created_at
       FROM priority_formula_versions WHERE is_active = 1
       ORDER BY version DESC
       LIMIT 1`,
    ).first<{
      id: string;
      version: number;
      weights: unknown;
      is_active: boolean;
      activated_at: string | null;
      activated_by: string | null;
      created_at: string;
    }>();

    if (!result) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "No priority formula version found",
          },
        },
        404,
      );
    }

    return c.json({
      id: result.id,
      version: result.version,
      weights:
        typeof result.weights === "string"
          ? JSON.parse(result.weights)
          : result.weights,
      is_active: !!result.is_active,
      activated_at: result.activated_at,
      activated_by: result.activated_by,
      created_at: result.created_at,
    });
  }),
);

priorityConfigRoute.get(
  "/:version",
  safeHandler(async (c) => {
    const version = parseInt(c.req.param("version"), 10);
    if (isNaN(version)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid version number",
          },
        },
        400,
      );
    }

    const result = await c.env.D1.prepare(
      `SELECT id, version, weights, is_active, activated_at, activated_by, created_at
       FROM priority_formula_versions WHERE version = ?`,
    )
      .bind(version)
      .first<{
        id: string;
        version: number;
        weights: unknown;
        is_active: boolean;
        activated_at: string | null;
        activated_by: string | null;
        created_at: string;
      }>();

    if (!result) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Priority formula version not found",
          },
        },
        404,
      );
    }

    return c.json({
      id: result.id,
      version: result.version,
      weights: result.weights,
      is_active: !!result.is_active,
      activated_at: result.activated_at,
      activated_by: result.activated_by,
      created_at: result.created_at,
    });
  }),
);

priorityConfigRoute.post(
  "/",
  safeHandler(async (c) => {
    const admin = c.get("user");
    const { weights, reason } = await parseJson(c, CreatePriorityConfigSchema);

    const maxVersionResult = await c.env.D1.prepare(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM priority_formula_versions`,
    ).first<{ max_version: number }>();
    const newVersion = (maxVersionResult?.max_version ?? 0) + 1;

    const newId = generateId();
    await c.env.D1.prepare(
      `INSERT INTO priority_formula_versions (id, version, weights, is_active, created_at)
       VALUES (?, ?, ?, false, datetime('now'))`,
    )
      .bind(newId, newVersion, JSON.stringify(weights))
      .run();

    const result = await c.env.D1.prepare(
      `SELECT id, version, weights, is_active, created_at FROM priority_formula_versions WHERE id = ?`,
    )
      .bind(newId)
      .first<{
        id: string;
        version: number;
        weights: unknown;
        is_active: boolean;
        created_at: string;
      }>();

    if (!result) {
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve inserted version",
          },
        },
        500,
      );
    }

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: admin.sub,
        actorRole: admin.role,
        action: "priority_formula_version_create",
        ...(reason ? { reason } : {}),
        objectType: "priority_formula_version",
        objectId: result.id,
        after: {
          version: result.version,
          weights: result.weights,
          isActive: !!result.is_active,
        },
      }).catch((e) => {
        logger.error({
          route: "/api/priority-config",
          method: "POST",
          context: "audit_write_failed",
          action: "priority_formula_version_create",
          error: e as Error,
        });
      }),
    );

    return c.json(
      {
        id: result.id,
        version: result.version,
        weights: result.weights,
        is_active: !!result.is_active,
        created_at: result.created_at,
      },
      201,
    );
  }),
);
