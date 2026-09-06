import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";
import { parseQuery } from "@/lib/validation";
import { z } from "zod";

const MAX_RETRIES = 3;

const FailedAssessmentRow = z.object({
  id: z.string(),
  report_id: z.string(),
  tool_name: z.string(),
  error: z.string(),
  failed_at: z.string(),
  retry_count: z.number().default(0),
  next_retry_at: z.string().nullable(),
  last_error: z.string().nullable(),
  permanent_dlq: z.boolean().default(false),
});

export type FailedAssessment = z.infer<typeof FailedAssessmentRow>;

const FailedAssessmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  report_id: z.string().optional(),
  tool_name: z.string().optional(),
  permanent_dlq: z.coerce.boolean().optional(),
});

export const adminFailedAssessmentsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

adminFailedAssessmentsRoute.get(
  "/",
  safeHandler(async (c) => {
    const { page, limit, report_id, tool_name, permanent_dlq } = parseQuery(
      c,
      FailedAssessmentsQuerySchema,
    );
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (report_id) {
      filters.push(`fa.report_id = ?`);
      params.push(report_id);
    }
    if (tool_name) {
      filters.push(`fa.tool_name = ?`);
      params.push(tool_name);
    }
    if (permanent_dlq !== undefined) {
      filters.push(`fa.permanent_dlq = ?`);
      params.push(permanent_dlq);
    }

    const whereClause = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";

    const baseSql = `
      SELECT fa.id, fa.report_id, fa.tool_name, fa.error, fa.failed_at,
             COALESCE(fa.retry_count, 0) as retry_count,
             fa.next_retry_at, fa.last_error, COALESCE(fa.permanent_dlq, false) as permanent_dlq
      FROM failed_assessments fa
      JOIN reports r ON r.id = fa.report_id
    `;

    const listParams = [...params, limit, offset];
    const r = await c.env.D1.prepare(
      `${baseSql}${whereClause} ORDER BY fa.failed_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...listParams)
      .all<{
        id: string;
        report_id: string;
        tool_name: string;
        error: string;
        failed_at: string;
        retry_count: number;
        next_retry_at: string | null;
        last_error: string | null;
        permanent_dlq: boolean;
      }>();

    const countParams = [...params];
    const countR = await c.env.D1.prepare(
      `SELECT COUNT(*) AS total FROM failed_assessments fa JOIN reports r ON r.id = fa.report_id${whereClause}`,
    )
      .bind(...countParams)
      .all<{ total: number }>();

    return c.json({
      data: r.results ?? [],
      pagination: {
        total: countR.results?.[0]?.total ?? 0,
        page,
        limit,
      },
    });
  }),
);

adminFailedAssessmentsRoute.post(
  "/:id/retry",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "id required" } },
        400,
      );
    }
    const user = c.get("user");

    const beforeR = await c.env.D1.prepare(
      `SELECT fa.id, fa.report_id, fa.tool_name, fa.retry_count, fa.permanent_dlq, fa.last_error
       FROM failed_assessments fa WHERE fa.id = ?`,
    )
      .bind(id)
      .first<{
        id: string;
        report_id: string;
        tool_name: string;
        retry_count: number;
        permanent_dlq: boolean;
        last_error: string | null;
      }>();

    if (!beforeR) {
      return c.json(
        {
          error: { code: "NOT_FOUND", message: "Failed assessment not found" },
        },
        404,
      );
    }

    const record = beforeR;

    if (record.permanent_dlq) {
      return c.json(
        {
          error: {
            code: "PERMANENT_DLQ",
            message: "Cannot retry a permanent DLQ entry",
          },
        },
        400,
      );
    }

    const currentRetryCount = record.retry_count ?? 0;

    if (currentRetryCount >= MAX_RETRIES) {
      await c.env.D1.prepare(
        `UPDATE failed_assessments SET permanent_dlq = true, last_error = ? WHERE id = ?`,
      )
        .bind(`Max retries (${MAX_RETRIES}) exceeded`, id)
        .run();
      return c.json(
        {
          error: {
            code: "MAX_RETRIES_EXCEEDED",
            message: `Retry count ${currentRetryCount} >= ${MAX_RETRIES}, marked as permanent DLQ`,
          },
        },
        400,
      );
    }

    const { allTools } = await import("@/lib/agent/tools");
    const tool = allTools[record.tool_name as keyof typeof allTools];

    if (!tool) {
      return c.json(
        {
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool '${record.tool_name}' not found`,
          },
        },
        400,
      );
    }

    const reportR = await c.env.D1.prepare(
      `SELECT r.id, r.category_id, CAST(json_extract(r.geom, '$.coordinates[0]') AS REAL) AS lng, CAST(json_extract(r.geom, '$.coordinates[1]') AS REAL) AS lat,
              r.photo_urls, r.description, c.name AS category_name, r.title
       FROM reports r
       JOIN categories c ON c.id = r.category_id
       WHERE r.id = ?`,
    )
      .bind(record.report_id)
      .first<{
        id: string;
        category_id: string;
        lng: number;
        lat: number;
        photo_urls: string[] | null;
        description: string | null;
        category_name: string | null;
        title: string | null;
      }>();

    if (!reportR) {
      return c.json(
        {
          error: {
            code: "REPORT_NOT_FOUND",
            message: "Associated report not found",
          },
        },
        404,
      );
    }

    const report = reportR;
    const photoUrls = report.photo_urls ?? [];
    const firstPhotoUrl = photoUrls[0] ?? "";

    let toolInput: unknown;
    switch (record.tool_name) {
      case "assess_completeness":
        toolInput = { report_id: record.report_id };
        break;
      case "assess_media_quality":
        toolInput = {
          report_id: record.report_id,
          image_url: firstPhotoUrl,
          category_name: report.category_name ?? "",
          description: report.description ?? "",
        };
        break;
      case "assess_location_time_consistency":
        toolInput = {
          report_id: record.report_id,
          photo_key: photoUrls[0]
            ? photoUrls[0].replace(/^reports\/[a-f0-9-]+\//, "")
            : "",
        };
        break;
      case "classify_problem":
        toolInput = {
          report_id: record.report_id,
          description: report.description ?? "",
          category_name: report.category_name ?? "",
        };
        break;
      case "find_duplicates":
        toolInput = {
          report_id: record.report_id,
          lng: report.lng,
          lat: report.lat,
          category_id: report.category_id,
        };
        break;
      case "detect_privacy_risk":
        toolInput = {
          report_id: record.report_id,
          description: report.description ?? "",
          image_url: firstPhotoUrl,
        };
        break;
      case "extract_damage_indicators":
        toolInput = {
          report_id: record.report_id,
          image_url: firstPhotoUrl,
          category_name: report.category_name ?? "",
          description: report.description ?? "",
        };
        break;
      default: {
        toolInput = {
          report_id: record.report_id,
          image_url: firstPhotoUrl,
          category_name: report.category_name ?? "",
          description: report.description ?? "",
        };
      }
    }

    let toolResult: {
      status: "fulfilled" | "rejected";
      value?: unknown;
      error?: string;
    };
    try {
      const execFn = tool.execute as (
        env: Env,
        input: unknown,
      ) => Promise<unknown>;
      const timeoutMs = 60000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Timeout: ${record.tool_name} exceeded 60s`)),
          timeoutMs,
        );
      });
      const execResult = await Promise.race([
        execFn(c.env, toolInput),
        timeoutPromise,
      ]);
      toolResult = { status: "fulfilled", value: execResult };
    } catch (e) {
      toolResult = { status: "rejected", error: (e as Error).message };
    }

    const newRetryCount = currentRetryCount + 1;

    if (toolResult.status === "fulfilled") {
      await c.env.D1.prepare(`DELETE FROM failed_assessments WHERE id = ?`)
        .bind(id)
        .run();

      const { saveAssessment } = await import("@/lib/agent/store");
      const idempotencyKey = `${record.tool_name}_${record.report_id}_retry_${Date.now()}`;
      await saveAssessment(c.env, {
        tool_name: record.tool_name,
        report_id: record.report_id,
        model_version: c.env.TEXT_MODEL_NAME ?? "MiniMax-M2.1",
        rule_version: "1.0.0",
        confidence:
          (toolResult.value as { confidence?: number })?.confidence ?? 0.5,
        supporting_factors: [],
        risk_factors: [],
        correlation_ids: [idempotencyKey],
        idempotency_key: idempotencyKey,
        status: "completed",
        result: toolResult.value as Record<string, unknown>,
      });

      c.executionCtx.waitUntil(
        appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: user.sub,
          action: "failed_assessment_retry_success",
          objectType: "failed_assessment",
          objectId: id,
          after: { status: "recovered", retry_count: newRetryCount },
        }).catch((e) =>
          logger.error({
            route: "/api/admin/failed-assessments",
            method: "POST",
            context: "audit_write_failed",
            error: e,
          }),
        ),
      );

      return c.json({
        success: true,
        message: "Retry successful, failure record removed",
        retry_count: newRetryCount,
        assessment: toolResult.value,
      });
    } else {
      const isPermanent = newRetryCount >= MAX_RETRIES;
      await c.env.D1.prepare(
        `UPDATE failed_assessments
         SET retry_count = ?,
             last_error = ?,
             next_retry_at = ?,
             permanent_dlq = ?
         WHERE id = ?`,
      )
        .bind(
          newRetryCount,
          toolResult.error ?? "Unknown error",
          isPermanent ? null : new Date(Date.now() + 3600000).toISOString(),
          isPermanent,
          id,
        )
        .run();

      c.executionCtx.waitUntil(
        appendAudit(c.env, {
          activeRole: c.get("user").role,
          actor: user.sub,
          action: "failed_assessment_retry_failed",
          objectType: "failed_assessment",
          objectId: id,
          after: {
            status: isPermanent ? "permanent_dlq" : "retry_failed",
            retry_count: newRetryCount,
            error: toolResult.error,
          },
        }).catch((e) =>
          logger.error({
            route: "/api/admin/failed-assessments",
            method: "POST",
            context: "audit_write_failed",
            error: e,
          }),
        ),
      );

      return c.json({
        success: false,
        message: isPermanent
          ? "Retry failed, marked as permanent DLQ"
          : "Retry failed, will be retried again",
        retry_count: newRetryCount,
        permanent_dlq: isPermanent,
        error: toolResult.error,
      });
    }
  }),
);

adminFailedAssessmentsRoute.delete(
  "/:id",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "id required" } },
        400,
      );
    }
    const user = c.get("user");

    const beforeR = await c.env.D1.prepare(
      `SELECT fa.id, fa.report_id, fa.tool_name FROM failed_assessments fa WHERE fa.id = ?`,
    )
      .bind(id)
      .first<{ id: string; report_id: string; tool_name: string }>();

    if (!beforeR) {
      return c.json(
        {
          error: { code: "NOT_FOUND", message: "Failed assessment not found" },
        },
        404,
      );
    }

    const record = beforeR;

    await c.env.D1.prepare(`DELETE FROM failed_assessments WHERE id = ?`)
      .bind(id)
      .run();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "failed_assessment_deleted",
        objectType: "failed_assessment",
        objectId: id,
        before: { report_id: record.report_id, tool_name: record.tool_name },
        after: { status: "deleted" },
      }).catch((e) =>
        logger.error({
          route: "/api/admin/failed-assessments",
          method: "DELETE",
          context: "audit_write_failed",
          error: e,
        }),
      ),
    );

    return c.json({
      success: true,
      message: "Failed assessment record deleted",
    });
  }),
);
