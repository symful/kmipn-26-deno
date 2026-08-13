import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";
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

export const adminFailedAssessmentsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminFailedAssessmentsRoute.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const query = FailedAssessmentsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() }, 400);
    }
    const { page, limit, report_id, tool_name, permanent_dlq } = query.data;
    const offset = (page - 1) * limit;

    const result = await withClient(c.env, async (client) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (report_id) {
        filters.push(`fa.report_id = $${i++}`);
        params.push(report_id);
      }
      if (tool_name) {
        filters.push(`fa.tool_name = $${i++}`);
        params.push(tool_name);
      }
      if (permanent_dlq !== undefined) {
        filters.push(`fa.permanent_dlq = $${i++}`);
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
      const r = await client.query(
        `${baseSql}${whereClause} ORDER BY fa.failed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams
      );

      const countParams = [...params];
      const countR = await client.query(
        `SELECT COUNT(*)::int AS total FROM failed_assessments fa JOIN reports r ON r.id = fa.report_id${whereClause}`,
        countParams
      );

      return {
        items: r.rows,
        total: countR.rows[0]?.total ?? 0,
      };
    });

    return c.json({ items: result.items, total: result.total, page, limit });
  }),
);

adminFailedAssessmentsRoute.post(
  "/:id/retry",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "id required" } }, 400);
    }
    const user = c.get("user");

    const result = await withClient(c.env, async (client) => {
      const beforeR = await client.query(
        `SELECT fa.id, fa.report_id, fa.tool_name, fa.retry_count, fa.permanent_dlq, fa.last_error
         FROM failed_assessments fa WHERE fa.id = $1`,
        [id]
      );

      if (!beforeR.rows[0]) {
        return { error: "NOT_FOUND", message: "Failed assessment not found" };
      }

      const record = beforeR.rows[0];

      if (record.permanent_dlq) {
        return { error: "PERMANENT_DLQ", message: "Cannot retry a permanent DLQ entry" };
      }

      const currentRetryCount = record.retry_count ?? 0;

      if (currentRetryCount >= MAX_RETRIES) {
        await client.query(
          `UPDATE failed_assessments SET permanent_dlq = true, last_error = $1 WHERE id = $2`,
          [`Max retries (${MAX_RETRIES}) exceeded`, id]
        );
        return {
          error: "MAX_RETRIES_EXCEEDED",
          message: `Retry count ${currentRetryCount} >= ${MAX_RETRIES}, marked as permanent DLQ`
        };
      }

      const { allTools } = await import("@/lib/agent/tools");
      const tool = allTools[record.tool_name as keyof typeof allTools];

      if (!tool) {
        return { error: "TOOL_NOT_FOUND", message: `Tool '${record.tool_name}' not found` };
      }

      const reportR = await client.query(
        `SELECT r.id, r.category_id, ST_X(r.geom::geometry) AS lng, ST_Y(r.geom::geometry) AS lat,
                r.photo_urls, r.description, c.name AS category_name, r.title
         FROM reports r
         JOIN categories c ON c.id = r.category_id
         WHERE r.id = $1`,
        [record.report_id]
      );

      if (!reportR.rows[0]) {
        return { error: "REPORT_NOT_FOUND", message: "Associated report not found" };
      }

      const report = reportR.rows[0];
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
          toolInput = { report_id: record.report_id, photo_key: photoUrls[0] ? photoUrls[0].replace(/^reports\/[a-f0-9-]+\//, "") : "" };
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
        default:
          return { error: "TOOL_NOT_IMPLEMENTED", message: `Tool '${record.tool_name}' retry not implemented` };
      }

      let toolResult: { status: "fulfilled" | "rejected"; value?: unknown; error?: string };
      try {
        const execFn = tool.execute as (env: Env, input: unknown) => Promise<unknown>;
        const timeoutMs = 60000;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout: ${record.tool_name} exceeded 60s`)), timeoutMs);
        });
        const result = await Promise.race([execFn(c.env, toolInput), timeoutPromise]);
        toolResult = { status: "fulfilled", value: result };
      } catch (e) {
        toolResult = { status: "rejected", error: (e as Error).message };
      }

      const newRetryCount = currentRetryCount + 1;

      if (toolResult.status === "fulfilled") {
        await client.query(`DELETE FROM failed_assessments WHERE id = $1`, [id]);

        const { saveAssessment } = await import("@/lib/agent/store");
        const idempotencyKey = `${record.tool_name}_${record.report_id}_retry_${Date.now()}`;
        await saveAssessment(c.env, {
          tool_name: record.tool_name,
          report_id: record.report_id,
          model_version: c.env.TEXT_MODEL_NAME ?? "MiniMax-M2.1",
          rule_version: "1.0.0",
          confidence: (toolResult.value as { confidence?: number })?.confidence ?? 0.5,
          supporting_factors: [],
          risk_factors: [],
          correlation_ids: [idempotencyKey],
          idempotency_key: idempotencyKey,
          status: "completed",
          result: toolResult.value as Record<string, unknown>,
        });

        appendAudit(c.env, {
          actor: user.sub,
          action: "failed_assessment_retry_success",
          objectType: "failed_assessment",
          objectId: id,
          after: { status: "recovered", retry_count: newRetryCount },
        }).catch((e) => logger.error({ route: "/api/admin/failed-assessments", method: "POST", context: "audit_write_failed", error: e }));

        return {
          success: true,
          message: "Retry successful, failure record removed",
          retry_count: newRetryCount,
          assessment: toolResult.value,
        };
      } else {
        const isPermanent = newRetryCount >= MAX_RETRIES;
        await client.query(
          `UPDATE failed_assessments
           SET retry_count = $1,
               last_error = $2,
               next_retry_at = $3,
               permanent_dlq = $4
           WHERE id = $5`,
          [
            newRetryCount,
            toolResult.error ?? "Unknown error",
            isPermanent ? null : new Date(Date.now() + 3600000).toISOString(),
            isPermanent,
            id,
          ]
        );

        appendAudit(c.env, {
          actor: user.sub,
          action: "failed_assessment_retry_failed",
          objectType: "failed_assessment",
          objectId: id,
          after: {
            status: isPermanent ? "permanent_dlq" : "retry_failed",
            retry_count: newRetryCount,
            error: toolResult.error,
          },
        }).catch((e) => logger.error({ route: "/api/admin/failed-assessments", method: "POST", context: "audit_write_failed", error: e }));

        return {
          success: false,
          message: isPermanent ? "Retry failed, marked as permanent DLQ" : "Retry failed, will be retried again",
          retry_count: newRetryCount,
          permanent_dlq: isPermanent,
          error: toolResult.error,
        };
      }
    });

    if (result && "error" in result) {
      if (result.error === "NOT_FOUND") {
        return c.json({ error: { code: "NOT_FOUND", message: result.message } }, 404);
      }
      if (result.error === "PERMANENT_DLQ") {
        return c.json({ error: { code: "PERMANENT_DLQ", message: result.message } }, 400);
      }
      if (result.error === "MAX_RETRIES_EXCEEDED") {
        return c.json({ error: { code: "MAX_RETRIES_EXCEEDED", message: result.message } }, 400);
      }
      if (result.error === "TOOL_NOT_FOUND" || result.error === "TOOL_NOT_IMPLEMENTED") {
        return c.json({ error: { code: result.error, message: result.message } }, 400);
      }
      if (result.error === "REPORT_NOT_FOUND") {
        return c.json({ error: { code: "REPORT_NOT_FOUND", message: result.message } }, 404);
      }
      return c.json({ error: { code: result.error, message: result.message } }, 400);
    }

    return c.json(result);
  }),
);

adminFailedAssessmentsRoute.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "id required" } }, 400);
    }
    const user = c.get("user");

    const result = await withClient(c.env, async (client) => {
      const beforeR = await client.query(
        `SELECT fa.id, fa.report_id, fa.tool_name FROM failed_assessments fa WHERE fa.id = $1`,
        [id]
      );

      if (!beforeR.rows[0]) {
        return { error: "NOT_FOUND", message: "Failed assessment not found" };
      }

      const record = beforeR.rows[0];

      await client.query(`DELETE FROM failed_assessments WHERE id = $1`, [id]);

      appendAudit(c.env, {
        actor: user.sub,
        action: "failed_assessment_deleted",
        objectType: "failed_assessment",
        objectId: id,
        before: { report_id: record.report_id, tool_name: record.tool_name },
        after: { status: "deleted" },
      }).catch((e) => logger.error({ route: "/api/admin/failed-assessments", method: "DELETE", context: "audit_write_failed", error: e }));

      return { success: true, message: "Failed assessment record deleted" };
    });

    if (result && "error" in result) {
      const statusCode = result.error === "NOT_FOUND" ? 404 : 400;
      return c.json({ error: { code: result.error, message: result.message } }, statusCode);
    }

    return c.json(result);
  }),
);
