import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { UpdatePriorityConfigSchema } from "@/lib/schemas";

export const priorityConfigDetailRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

priorityConfigDetailRoute.patch(
  "/:version",
  safeHandler(async (c) => {
    const admin = c.get("user");
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

    const { weights } = await parseJson(c, UpdatePriorityConfigSchema);

    const existing = await c.env.D1.prepare(
      `SELECT id, is_active FROM priority_formula_versions WHERE version = ?`,
    )
      .bind(version)
      .first<{ id: string; is_active: boolean }>();

    if (!existing) {
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

    if (existing.is_active) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message:
              "Cannot update weights of an active version. Activate a different version first.",
          },
        },
        403,
      );
    }

    const beforeResult = await c.env.D1.prepare(
      `SELECT weights FROM priority_formula_versions WHERE version = ?`,
    )
      .bind(version)
      .first<{ weights: unknown }>();

    await c.env.D1.prepare(
      `UPDATE priority_formula_versions
       SET weights = ?
       WHERE version = ?`,
    )
      .bind(JSON.stringify(weights), version)
      .run();

    const afterResult = await c.env.D1.prepare(
      `SELECT id, version, weights, is_active, created_at FROM priority_formula_versions WHERE version = ?`,
    )
      .bind(version)
      .first<{
        id: string;
        version: number;
        weights: unknown;
        is_active: boolean;
        created_at: string;
      }>();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: admin.sub,
        actorRole: admin.role,
        action: "priority_formula_version_update",
        objectType: "priority_formula_version",
        objectId: afterResult?.id ?? "",
        before: { version, weights: beforeResult?.weights },
        after: { version, weights, isActive: afterResult?.is_active },
      }).catch((e) => {
        logger.error({
          route: "/api/priority-config",
          method: "PATCH",
          context: "audit_write_failed",
          action: "priority_formula_version_update",
          error: e as Error,
        });
      }),
    );

    return c.json({
      id: afterResult?.id,
      version: afterResult?.version,
      weights: afterResult?.weights,
      is_active: afterResult?.is_active,
      created_at: afterResult?.created_at,
    });
  }),
);
