import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { auditReportChange } from "@/lib/audit-helpers";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { AdminMergeSchema } from "@/lib/schemas";
import { ID_REGEX } from "@/lib/id";

const TERMINAL_STATES = [
  "closed",
  "rejected",
  "merged",
  "separated",
  "resolved",
  "duplicate_merged",
] as const;

export const mergeRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

mergeRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id)
      return c.json(
        { error: { code: "MISSING_ID", message: "ID is required" } },
        400,
      );

    const { target_case_ids, reason } = await parseJson(c, AdminMergeSchema);

    for (const cid of target_case_ids) {
      if (!ID_REGEX.test(String(cid))) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "All case IDs must be valid",
            },
          },
          400,
        );
      }
    }

    if (!ID_REGEX.test(id)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Source case ID must be a valid",
          },
        },
        400,
      );
    }

    const env = c.env;

    const sourceR = await env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ id: string; status: string }>();
    if (!sourceR) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Source case not found" } },
        404,
      );
    }
    const sourceStatus = sourceR.status;
    if (
      TERMINAL_STATES.includes(sourceStatus as (typeof TERMINAL_STATES)[number])
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot merge a case in '${sourceStatus}' state`,
          },
        },
        409,
      );
    }

    for (const targetId of target_case_ids) {
      const targetR = await env.D1.prepare(
        "SELECT id, status FROM reports WHERE id = ?1",
      )
        .bind(targetId)
        .first<{ id: string; status: string }>();
      if (!targetR) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: `Target case ${targetId} not found`,
            },
          },
          404,
        );
      }
      const targetStatus = targetR.status;
      if (
        TERMINAL_STATES.includes(
          targetStatus as (typeof TERMINAL_STATES)[number],
        )
      ) {
        return c.json(
          {
            error: {
              code: "INVALID_TRANSITION",
              message: `Cannot merge a case in '${targetStatus}' state`,
            },
          },
          409,
        );
      }
    }

    const mergedInto = target_case_ids[0];
    const others = target_case_ids.slice(1);

    const statements: ReturnType<typeof env.D1.prepare>[] = [];

    statements.push(
      env.D1.prepare(
        "UPDATE reports SET status = 'duplicate_merged', merged_into = ?1, updated_at = datetime('now') WHERE id = ?2",
      ).bind(mergedInto, id),
    );

    for (const otherId of others) {
      statements.push(
        env.D1.prepare(
          "UPDATE reports SET status = 'merged', merged_into = ?1, updated_at = datetime('now') WHERE id = ?2",
        ).bind(mergedInto, otherId),
      );
    }

    await env.D1.batch(statements);

    const afterR = await env.D1.prepare(
      "SELECT id, status, merged_into FROM reports WHERE id = ?1",
    )
      .bind(id)
      .first<{ id: string; status: string; merged_into: string }>();

    const result = {
      before: { id, status: sourceStatus },
      after: afterR,
      merged_case_ids: [id, ...target_case_ids],
      primary_case_id: mergedInto,
    };

    c.executionCtx.waitUntil(
      auditReportChange(
        c.env,
        user.sub,
        id,
        "report_merge",
        result.before,
        result.after,
        reason,
      ).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_failed",
        }),
      ),
    );

    return c.json({
      success: true,
      status: "merged",
      primary_case_id: result.primary_case_id,
      merged_case_ids: result.merged_case_ids,
    });
  }),
);
