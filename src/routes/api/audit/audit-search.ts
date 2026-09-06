import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { AuditorAuditSearchQuerySchema } from "@/lib/schemas";

export const auditSearchRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

auditSearchRoute.get(
  "/",
  safeHandler(async (c) => {
    const env = c.env;
    const {
      actor_id: actorId,
      action,
      object_type: objectType,
      object_id: objectId,
      from,
      to,
      page,
      limit,
    } = parseQuery(c, AuditorAuditSearchQuerySchema);
    const offset = (page - 1) * limit;

    const filters: string[] = [];
    const params: unknown[] = [];

    if (actorId) {
      filters.push(`actor = ?`);
      params.push(actorId);
    }
    if (action) {
      filters.push(`action = ?`);
      params.push(action);
    }
    if (objectType) {
      filters.push(`object_type = ?`);
      params.push(objectType);
    }
    if (objectId) {
      filters.push(`object_id = ?`);
      params.push(objectId);
    }
    if (from) {
      filters.push(`created_at >= ?`);
      params.push(from);
    }
    if (to) {
      filters.push(`created_at <= ?`);
      params.push(to);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const totalR = await env.D1.prepare(
      `SELECT COUNT(*) AS total FROM audit_log ${where}`,
    )
      .bind(...params)
      .first<{ total: number }>();
    const total = totalR?.total ?? 0;

    const listParams = [...params, limit, offset];
    let entriesR = await env.D1.prepare(
      `SELECT id, actor, actor_role, action, object_type, object_id,
              before_data, after_data, reason, created_at, prev_hash, entry_hash
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...listParams)
      .all();

    // Handle D1 eventual consistency: retry up to 3 times with backoff if no results
    if ((entriesR.results ?? []).length === 0 && filters.length === 0) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const delay = 300 * (attempt + 1); // 300ms, 600ms, 900ms
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        entriesR = await env.D1.prepare(
          `SELECT id, actor, actor_role, action, object_type, object_id,
                  before_data, after_data, reason, created_at, prev_hash, entry_hash
           FROM audit_log ${where}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        )
          .bind(...listParams)
          .all();
        if ((entriesR.results ?? []).length > 0) break;
      }
    }

    return c.json({
      entries: (entriesR.results ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        actor: row.actor,
        actor_role: row.actor_role,
        action: row.action,
        object_type: row.object_type,
        object_id: row.object_id,
        before: row.before_data,
        after: row.after_data,
        reason: row.reason,
        created_at: row.created_at,
      })),
      data: (entriesR.results ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        actor: row.actor,
        actor_role: row.actor_role,
        action: row.action,
        object_type: row.object_type,
        object_id: row.object_id,
        before_data: row.before_data,
        after_data: row.after_data,
        reason: row.reason,
        created_at: row.created_at,
        prev_hash: row.prev_hash,
        hash: row.entry_hash,
      })),
      pagination: {
        total,
        page,
        limit,
      },
    });
  }),
);
