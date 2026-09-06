import type { z } from "zod";
import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { ReportCreateSchema, SyncBatchSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/validation";
import { evaluatePriority } from "@/lib/priority/calculator";

export const syncBatchRoute = new Hono<{ Bindings: Env }>();

syncBatchRoute.post(
  "/",
  safeHandler(async (c) => {
    const { reports } = await parseJson(c, SyncBatchSchema);
    const env = c.env;
    const authUser = c.get("user");
    if (!authUser?.sub) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "User not authenticated" } },
        401,
      );
    }

    const results: Array<{
      index: number;
      id?: string | undefined;
      error?: string | undefined;
    }> = [];
    let totalSuccess: number = 0;
    let totalFailure: number = 0;
    const insertedReportIds: string[] = [];

    const validatedReports: Array<{
      index: number;
      data: z.output<typeof ReportCreateSchema>;
    }> = [];
    for (let i = 0; i < reports.length; i++) {
      const parsed = ReportCreateSchema.safeParse(reports[i]);
      if (!parsed.success) {
        results.push({
          index: i,
          error: `Validation failed: ${parsed.error.message}`,
        });
        totalFailure = (totalFailure || 0) + 1;
      } else {
        validatedReports.push({ index: i, data: parsed.data });
      }
    }

    if (validatedReports.length === 0) {
      return c.json(
        {
          results,
          success_count: 0,
          failure_count: reports.length,
        },
        200,
      );
    }

    const statements: ReturnType<typeof env.D1.prepare>[] = [];
    const insertOrder: number[] = [];

    for (const vr of validatedReports) {
      const data = vr.data;

      const reportedAt = data.reported_at
        ? new Date(data.reported_at)
        : new Date();
      const photoUrlsJson = JSON.stringify(data.photo_urls ?? []);
      const titleValue = data.title ?? data.description?.slice(0, 60) ?? null;
      const severityValue: number | null = null;

      const existing = await env.D1.prepare(
        "SELECT id FROM reports WHERE idempotency_key = ?1",
      )
        .bind(data.idempotency_key)
        .first<{ id: string }>();

      if (existing?.id) {
        results.push({ index: vr.index, id: existing.id });
        totalSuccess = (totalSuccess || 0) + 1;
        continue;
      }

      const category = await env.D1.prepare(
        "SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL",
      )
        .bind(data.category_id)
        .first();
      if (!category) {
        results.push({
          index: vr.index,
          error: "category_id: Category not found",
        });
        totalFailure++;
        continue;
      }
      if (data.supporting_case_id) {
        const target = await env.D1.prepare(
          "SELECT id FROM reports WHERE id = ? AND merged_into IS NULL AND status NOT IN ('rejected','out_of_scope','draft')",
        )
          .bind(data.supporting_case_id)
          .first();
        if (!target) {
          results.push({
            index: vr.index,
            error: "supporting_case_id: Case is unavailable",
          });
          totalFailure++;
          continue;
        }
      }

      const stmt = env.D1.prepare(
        `INSERT INTO reports (id, reporter_id, idempotency_key, category_id, description, lat, lng, photo_urls, status, created_at, updated_at, reported_at, title, population_affected, vulnerability_index, severity, local_id, device_id, impact_dampak, kecamatan, kelurahan, kabupaten, provinsi, impact, merged_into)
         VALUES (lower(hex(randomblob(6))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'submitted', datetime('now'), datetime('now'), ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        authUser.sub,
        data.idempotency_key,
        data.category_id,
        data.description,
        data.lat,
        data.lng,
        photoUrlsJson,
        reportedAt.toISOString(),
        titleValue,
        data.population_affected ?? null,
        data.vulnerability_index ?? null,
        severityValue,
        data.local_id ?? null,
        data.device_id ?? null,
        data.impact_dampak ? JSON.stringify(data.impact_dampak) : null,
        data.kecamatan ?? null,
        data.kelurahan ?? null,
        data.kabupaten ?? null,
        data.provinsi ?? null,
        JSON.stringify({ reported_severity: data.reported_severity ?? null }),
        data.supporting_case_id ?? null,
      );

      statements.push(stmt);
      insertOrder.push(vr.index);
    }

    if (statements.length > 0) {
      try {
        const batchResult = await env.D1.batch(statements);

        for (let i = 0; i < insertOrder.length; i++) {
          const reportIdx = insertOrder[i] as number;
          const result = batchResult[i];
          const insertSuccess = result && result.success === true;

          if (insertSuccess) {
            const vr = validatedReports.find((r) => r.index === reportIdx);
            const idempotencyKey = vr?.data.idempotency_key ?? "";
            const inserted = await env.D1.prepare(
              "SELECT id FROM reports WHERE idempotency_key = ?1",
            )
              .bind(idempotencyKey)
              .first<{ id: string }>();

            results.push({ index: reportIdx, id: inserted?.id });
            if (inserted?.id && result.meta.changes > 0)
              insertedReportIds.push(inserted.id);
            totalSuccess = (totalSuccess || 0) + 1;
          } else {
            results.push({ index: reportIdx, error: "Insert failed" });
            totalFailure = (totalFailure || 0) + 1;
          }
        }
      } catch (err) {
        logger.error({
          route: c.req.path,
          method: c.req.method,
          context: "batch_insert_error",
          error: err as Error,
        });
        for (const idx of insertOrder) {
          const existing = results.find((r) => r.index === idx);
          if (!existing) {
            results.push({ index: idx, error: "Batch insert error" });
            totalFailure = (totalFailure || 0) + 1;
            totalSuccess = Math.max(0, (totalSuccess || 0) - 1);
          }
        }
      }
    }

    // Record synchronization and calculate deterministic priority; AI requires a button action.
    if (insertedReportIds.length > 0) {
      c.executionCtx.waitUntil(
        Promise.all(
          insertedReportIds.map((reportId) =>
            Promise.all([
              env.D1.prepare(
                `INSERT INTO report_status_history (id, report_id, status, label, actor, occurred_at)
                 VALUES (lower(hex(randomblob(6))), ?, 'submitted', ?, ?, datetime('now'))`,
              )
                .bind(reportId, "Laporan dibuat (sinkronisasi)", authUser.sub)
                .run()
                .catch((e) =>
                  logger.error({
                    route: c.req.path,
                    method: c.req.method,
                    error: e,
                    context: "status_history_create_failed",
                    reportId,
                  }),
                ),
              evaluatePriority(env, reportId).catch((e) =>
                logger.error({
                  route: c.req.path,
                  method: c.req.method,
                  error: e,
                  context: "priority_calc_failed",
                  reportId,
                }),
              ),
            ]),
          ),
        ),
      );
    }

    return c.json(
      {
        results,
        success_count: totalSuccess,
        failure_count: totalFailure,
      },
      200,
    );
  }),
);
