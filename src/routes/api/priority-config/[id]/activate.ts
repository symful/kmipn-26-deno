import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJson } from "@/lib/validation";
import { evaluatePriority } from "@/lib/priority/calculator";

export const priorityConfigActivateRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

priorityConfigActivateRoute.post(
  "/",
  safeHandler(async (c) => {
    const admin = c.get("user");
    const { reason } = await parseJson(
      c,
      z.object({ reason: z.string().trim().min(1).max(1000).optional() }),
    );
    const rawParam = c.req.param("version") ?? c.req.param("id") ?? "";
    const asVersion = parseInt(rawParam, 10);
    let existing: { id: string; is_active: boolean } | null = null;
    if (!isNaN(asVersion)) {
      existing = await c.env.D1.prepare(
        `SELECT id, is_active FROM priority_formula_versions WHERE version = ?`,
      )
        .bind(asVersion)
        .first<{ id: string; is_active: boolean }>();
    }
    if (!existing) {
      existing = await c.env.D1.prepare(
        `SELECT id, is_active FROM priority_formula_versions WHERE id = ?`,
      )
        .bind(rawParam)
        .first<{ id: string; is_active: boolean }>();
    }

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

    await c.env.D1.batch([
      c.env.D1.prepare(
        `UPDATE priority_formula_versions SET is_active = false, activated_at = NULL, activated_by = NULL WHERE is_active = true`,
      ),
      c.env.D1.prepare(
        `UPDATE priority_formula_versions
       SET is_active = true, activated_at = datetime('now'), activated_by = ?
       WHERE id = ?`,
      ).bind(admin.sub, existing.id),
    ]);
    c.executionCtx.waitUntil(
      (async () => {
        const reports = await c.env.D1.prepare("SELECT id FROM reports").all<{
          id: string;
        }>();
        for (const report of reports.results)
          await evaluatePriority(c.env, report.id);
      })().catch((error) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          context: "priority_recalculation_failed",
          error,
        }),
      ),
    );

    const result = await c.env.D1.prepare(
      `SELECT id, version, weights, is_active, activated_at, activated_by, created_at FROM priority_formula_versions WHERE id = ?`,
    )
      .bind(existing.id)
      .first<{
        id: string;
        version: number;
        weights: unknown;
        is_active: boolean;
        activated_at: string | null;
        activated_by: string | null;
        created_at: string;
      }>();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: admin.sub,
        actorRole: admin.role,
        action: "priority_formula_version_activate",
        ...(reason ? { reason } : {}),
        objectType: "priority_formula_version",
        objectId: result?.id ?? "",
        after: {
          version: result?.version,
          isActive: !!result?.is_active,
          activated_at: result?.activated_at,
        },
      }).catch((e) => {
        logger.error({
          route: "/api/priority-config",
          method: "POST",
          context: "audit_write_failed",
          action: "priority_formula_version_activate",
          error: e as Error,
        });
      }),
    );

    return c.json({
      id: result?.id,
      version: result?.version,
      weights:
        typeof result?.weights === "string"
          ? JSON.parse(result.weights)
          : result?.weights,
      is_active: !!result?.is_active,
      activated_at: result?.activated_at,
      activated_by: result?.activated_by,
      created_at: result?.created_at,
    });
  }),
);
