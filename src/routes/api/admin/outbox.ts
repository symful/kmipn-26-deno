import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";

const DlqQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  target_system: z.string().optional(),
});

export const adminOutboxRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /api/admin/outbox/dlq - Returns paginated dead-letter entries
adminOutboxRoute.get(
  "/dlq",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const query = DlqQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid query params" }, details: query.error.flatten() }, 400);
    }
    const { page, limit, target_system } = query.data;
    const offset = (page - 1) * limit;

    const result = await withClient(c.env, async (client) => {
      const filters: string[] = ["o.status = 'dead_letter'"];
      const params: unknown[] = [];
      let i = 1;

      if (target_system) {
        filters.push(`o.target_system = $${i++}`);
        params.push(target_system);
      }

      const outboxBase = `SELECT o.id, o.created_at, o.target_system, o.payload, o.status,
          o.retry_count, o.last_attempt_at, o.error_message as last_error, o.related_report_id,
          o.next_retry_at
       FROM outbox o
       LEFT JOIN reports r ON r.id = o.related_report_id`;

      const { sql: listBaseSql, params: listBaseParams } = applyWilayahFilter(
        outboxBase + (filters.length ? ` WHERE ${filters.join(" AND ")}` : ""),
        params,
        user.wilayah_id,
        "r",
      );

      const listParams = [...listBaseParams, limit, offset];
      const r = await client.query(
        `${listBaseSql} ORDER BY o.created_at DESC LIMIT $${listBaseParams.length + 1} OFFSET $${listBaseParams.length + 2}`,
        listParams
      );

      const items = r.rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        target_system: row.target_system,
        last_error: row.last_error,
        retry_count: row.retry_count,
        related_report_id: row.related_report_id,
        next_retry_at: row.next_retry_at,
      }));

      const { sql: countSql, params: countParams } = applyWilayahFilter(
        `SELECT COUNT(*)::int AS total FROM outbox o LEFT JOIN reports r ON r.id = o.related_report_id` +
        (filters.length ? ` WHERE ${filters.join(" AND ")}` : ""),
        params,
        user.wilayah_id,
        "r",
      );
      const totalR = await client.query(countSql, countParams);
      const total = totalR.rows[0]?.total ?? 0;

      return { items, total };
    });

    return c.json({ items: result.items, total: result.total, page, limit });
  }),
);

// GET /api/admin/outbox/stats - Returns counts by target_system × status
adminOutboxRoute.get(
  "/stats",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");

    const result = await withClient(c.env, async (client) => {
      // For admin_global (null wilayah_id), no filtering needed
      // For specific wilayah, we need to join with reports
      let sql: string;
      let params: unknown[] = [];

      if (user.wilayah_id == null) {
        // Admin global - no filtering
        sql = `
          SELECT
            o.target_system,
            o.status,
            COUNT(*)::int AS count
          FROM outbox o
          GROUP BY o.target_system, o.status
          ORDER BY o.target_system, o.status
        `;
      } else {
        // Admin daerah - filter by wilayah via related_report_id
        sql = `
          SELECT
            o.target_system,
            o.status,
            COUNT(*)::int AS count
          FROM outbox o
          LEFT JOIN reports r ON r.id = o.related_report_id
          WHERE r.wilayah_id = $1
          GROUP BY o.target_system, o.status
          ORDER BY o.target_system, o.status
        `;
        params = [user.wilayah_id];
      }

      const r = await client.query(sql, params);

      // Aggregate into { target_system: { status: count } }
      const stats: Record<string, Record<string, number>> = {};
      for (const row of r.rows) {
        const ts = row.target_system ?? "unknown";
        const st = row.status ?? "unknown";
        if (!stats[ts]) stats[ts] = {};
        stats[ts][st] = row.count;
      }

      return { stats };
    });

    return c.json({ stats: result.stats });
  }),
);

// POST /api/admin/outbox/reconcile - Force-retry stuck entries (pending >24h or failed past retry time)
adminOutboxRoute.post(
  "/reconcile",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");

    const result = await withClient(c.env, async (client) => {
      // 1. Reset pending entries stuck for >24 hours (never processed)
      const stuckPending = await client.query(
        `UPDATE outbox
         SET status = 'pending',
             next_retry_at = NOW(),
             error_message = NULL
         WHERE status = 'pending'
           AND created_at < NOW() - INTERVAL '24 hours'
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         RETURNING id`,
      );

      // 2. Reset failed entries whose next_retry_at has passed
      const retryableFailed = await client.query(
        `UPDATE outbox
         SET status = 'pending',
             error_message = NULL
         WHERE status = 'failed'
           AND next_retry_at <= NOW()
         RETURNING id`,
      );

      return {
        reconciled: (stuckPending.rowCount ?? 0) + (retryableFailed.rowCount ?? 0),
        stuck_pending: stuckPending.rowCount ?? 0,
        retryable_failed: retryableFailed.rowCount ?? 0,
      };
    });

    appendAudit(c.env, { activeRole: c.get("user").role,
      actor: user.sub,
      action: "outbox_reconcile",
      objectType: "outbox",
      objectId: "bulk",
      after: {
        reconciled: result.reconciled,
        stuck_pending: result.stuck_pending,
        retryable_failed: result.retryable_failed,
      },
    }).catch((e) => logger.error({ route: c.req.path, method: "POST", audit_failure: true, action: "outbox_reconcile", err: e }));

    return c.json({
      status: "ok",
      reconciled: result.reconciled,
      details: {
        stuck_pending_reset: result.stuck_pending,
        retryable_failed_reset: result.retryable_failed,
      },
    });
  }),
);

// POST /api/admin/outbox/:id/reset - Clears DLQ entry and re-queues as pending
adminOutboxRoute.post(
  "/:id/reset",
  requireAuth,
  requireRole("ADMIN"),
  safeHandler(async (c) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "id required" } }, 400);
    }
    const user = c.get("user");

    const result = await withClient(c.env, async (client) => {
      // First check if the entry exists and is in dead_letter status
      const before = await client.query(
        `SELECT id, status, retry_count, error_message FROM outbox WHERE id = $1`,
        [id]
      );
      if (!before.rows[0]) {
        return { error: "NOT_FOUND", message: "Outbox entry not found" };
      }

      const entry = before.rows[0];
      if (entry.status !== "dead_letter") {
        return { error: "VALIDATION_ERROR", message: "Only dead_letter entries can be reset" };
      }

      // Reset the entry to pending, clear error, reset retry_count
      await client.query(
        `UPDATE outbox
         SET status = 'pending',
             retry_count = 0,
             error_message = NULL,
             last_attempt_at = NOW(),
             next_retry_at = NULL
         WHERE id = $1`,
        [id]
      );

      const after = await client.query(
        `SELECT id, status, retry_count, error_message FROM outbox WHERE id = $1`,
        [id]
      );

      return {
        before: { id: entry.id, status: entry.status, retry_count: entry.retry_count },
        after: { id: after.rows[0].id, status: after.rows[0].status, retry_count: after.rows[0].retry_count },
        reset_by: user.sub,
      };
    });

    if (result && "error" in result) {
      const statusCode = result.error === "NOT_FOUND" ? 404 : 400;
      return c.json({ error: { code: result.error, message: result.message } }, statusCode);
    }

    // Audit log
    appendAudit(c.env, { activeRole: c.get("user").role,
      actor: user.sub,
      action: "outbox_reset",
      objectType: "outbox",
      objectId: id,
      before: { status: "dead_letter" },
      after: { status: "pending", retry_count: 0 },
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, action: "outbox_reset", err: e }));

    return c.json({
      status: result!.after.status,
      retry_count: result!.after.retry_count,
      message: "Outbox entry reset to pending",
    });
  }),
);
