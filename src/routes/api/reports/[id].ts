import { Hono } from "hono";
import { REPORT_AREA_SQL } from "@/lib/report-area";
import type { Env } from "@/types/bindings";
import { ReportUpdateSchema } from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { evaluatePriority } from "@/lib/priority/calculator";
import { normalizePhotoUrls } from "@/lib/photo-urls";

export const reportByIdRoute = new Hono<{ Bindings: Env }>();

reportByIdRoute.get(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const isAdminOrAuditor = user.role === "ADMIN";

    let query = `SELECT r.id, r.idempotency_key, r.category_id, r.description, r.lng, r.lat,
                        r.photo_urls, r.status, r.severity, r.assigned_to, r.created_at, r.updated_at, r.title, r.deadline, r.merged_into,
                        ${REPORT_AREA_SQL} AS address_area, r.kecamatan, r.kelurahan, r.kabupaten, r.provinsi, r.impact_dampak,
                        json_extract(r.impact, '$.reported_severity') AS reported_severity,
                        cat.id AS cat_id, cat.name AS cat_name, cat.icon AS cat_icon,
                        u.id AS assignee_id, u.name AS assignee_name,
                        ps.computed_score AS priority_score,
                        CASE
                          WHEN ps.computed_score IS NULL THEN 'sedang'
                          WHEN ps.computed_score < 40 THEN 'rendah'
                          WHEN ps.computed_score < 60 THEN 'sedang'
                          WHEN ps.computed_score < 80 THEN 'tinggi'
                          ELSE 'kritis'
                        END AS priority_bucket,
                        (SELECT COUNT(*) FROM reports r2 WHERE r2.merged_into = r.id) AS supporting_count
                 FROM reports r
                 LEFT JOIN categories cat ON cat.id = r.category_id
                 LEFT JOIN users u ON u.id = r.assigned_to
                 LEFT JOIN priority_scores ps ON ps.report_id = r.id
                 WHERE r.id = ?`;
    const params: unknown[] = [id];

    const result = await c.env.D1.prepare(query)
      .bind(...params)
      .first<Record<string, unknown>>();
    if (!result)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Resource not found" } },
        404,
      );

    const supporting = await c.env.D1.prepare(
      `SELECT id, title, description, photo_urls, created_at FROM reports WHERE merged_into = ? ORDER BY created_at`,
    )
      .bind(id)
      .all<Record<string, unknown>>();

    const transformed = {
      id: result.id,
      idempotency_key: result.idempotency_key,
      category_id: result.category_id,
      category: result.cat_id
        ? { id: result.cat_id, name: result.cat_name, icon: result.cat_icon }
        : undefined,
      description: result.description,
      lng: result.lng,
      lat: result.lat,
      geom:
        typeof result.lng === "number" && typeof result.lat === "number"
          ? {
              type: "Point" as const,
              coordinates: [result.lng, result.lat] as [number, number],
            }
          : undefined,
      photo_urls: normalizePhotoUrls(result.photo_urls),
      status: result.status,
      severity: result.severity,
      reported_severity: result.reported_severity,
      supporting_case_id: result.merged_into,
      address_area: result.address_area,
      kecamatan: result.kecamatan,
      kelurahan: result.kelurahan,
      kabupaten: result.kabupaten,
      provinsi: result.provinsi,
      village_name: result.kelurahan,
      impact_dampak: result.impact_dampak,
      supporting_reports: (supporting.results ?? []).map((row) => ({
        ...row,
        photo_urls: normalizePhotoUrls(row.photo_urls),
      })),
      priority_score: result.priority_score,
      supporting_count: result.supporting_count ?? 0,
      priority_bucket: result.priority_bucket,
      assigned_to: result.assigned_to,
      assignee: result.assignee_id
        ? { id: result.assignee_id, name: result.assignee_name }
        : undefined,
      title: result.title,
      deadline: result.deadline,
      created_at: result.created_at,
      updated_at: result.updated_at,
      merged_into: result.merged_into,
    };

    return c.json(transformed);
  }),
);

reportByIdRoute.patch(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const isAdminOrAuditor = user.role === "ADMIN";
    const body = await c.req.json();
    const parsed = ReportUpdateSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );

    let beforeQuery = `SELECT id, status, description, priority, assigned_to, reporter_id FROM reports WHERE id = ?`;
    const beforeParams: unknown[] = [id];

    const before = await c.env.D1.prepare(beforeQuery)
      .bind(...beforeParams)
      .first<Record<string, unknown>>();
    if (!before)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Resource not found" } },
        404,
      );

    if (!isAdminOrAuditor && before.reporter_id !== user.sub) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Not authorized to update this report",
          },
        },
        403,
      );
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.address_area !== undefined) {
      fields.push(`address_area = ?`);
      params.push(parsed.data.address_area);
    }
    if (parsed.data.status !== undefined) {
      fields.push(`status = ?`);
      params.push(parsed.data.status);
    }
    if (parsed.data.description !== undefined) {
      fields.push(`description = ?`);
      params.push(parsed.data.description);
    }
    if (parsed.data.priority !== undefined) {
      fields.push(`severity = ?`);
      params.push(parsed.data.priority);
    }
    if (parsed.data.assigned_to !== undefined) {
      fields.push(`assigned_to = ?`);
      params.push(parsed.data.assigned_to);
    }
    if (!fields.length) {
      return c.json(before);
    }

    fields.push(`updated_at = datetime('now')`);
    params.push(id);

    await c.env.D1.prepare(
      `UPDATE reports SET ${fields.join(", ")} WHERE id = ?`,
    )
      .bind(...params)
      .run();

    const after = await c.env.D1.prepare(
      `SELECT id, local_id, category_id, reporter_id,
      description, impact, lat, lng, photo_urls, status, created_at, idempotency_key, updated_at,
      address_area, impact_dampak, severity, merged_into, separated_into, rejection_reason,
      deadline, verified_at, population_affected, vulnerability_index, ai_recommended_status,
      reported_at, title, facility_card_id, facility_card, device_id, assigned_to, geom, priority
      FROM reports WHERE id = ?`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (after) {
      after.photo_urls = normalizePhotoUrls(after.photo_urls);
      if (typeof after.lng === "number" && typeof after.lat === "number") {
        after.geom = {
          type: "Point" as const,
          coordinates: [after.lng, after.lat],
        };
      }
    }

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "report_update",
        objectType: "report",
        objectId: id,
        before,
        after,
        ...(parsed.data.reason === undefined
          ? {}
          : { reason: parsed.data.reason }),
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    const statusChanged = parsed.data.status !== undefined;
    if (statusChanged) {
      const newStatus = parsed.data.status;
      c.executionCtx.waitUntil(
        c.env.D1.prepare(
          `INSERT INTO report_status_history (id, report_id, status, label, actor, occurred_at)
           VALUES (lower(hex(randomblob(6))), ?, ?, ?, ?, datetime('now'))`,
        )
          .bind(id, newStatus, `Status → ${newStatus}`, user.sub)
          .run()
          .catch((e) =>
            logger.error({
              route: c.req.path,
              method: c.req.method,
              error: e,
              context: "status_history_update_failed",
            }),
          ),
      );
      c.executionCtx.waitUntil(
        evaluatePriority(c.env, id).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e,
            context: "priority_calc_failed",
          }),
        ),
      );
    }

    return c.json(after);
  }),
);

reportByIdRoute.delete(
  "/",
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const isAdminOrAuditor = user.role === "ADMIN";

    let checkQuery = `SELECT id, reporter_id FROM reports WHERE id = ?`;
    const checkParams: unknown[] = [id];

    const check = await c.env.D1.prepare(checkQuery)
      .bind(...checkParams)
      .first<{ id: string; reporter_id: string }>();
    if (!check)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Resource not found" } },
        404,
      );

    if (!isAdminOrAuditor && check.reporter_id !== user.sub) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Not authorized to delete this report",
          },
        },
        403,
      );
    }

    await c.env.D1.prepare("DELETE FROM reports WHERE id = ?").bind(id).run();

    return c.json({ success: true, deleted_id: id });
  }),
);
