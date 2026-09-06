import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

export const auditStatsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

auditStatsRoute.get(
  "/",
  safeHandler(async (c) => {
    const env = c.env;
    const now = new Date();
    const day24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const day7d = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const day30d = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [
      count24hResult,
      count7dResult,
      count30dResult,
      totalResult,
      topActorsResult,
      failedActionsResult,
      recentSuspiciousResult,
    ] = await Promise.all([
      env.D1.prepare(
        `SELECT COUNT(*) AS count FROM audit_log WHERE created_at >= ?`,
      )
        .bind(day24h)
        .first<{ count: number }>(),
      env.D1.prepare(
        `SELECT COUNT(*) AS count FROM audit_log WHERE created_at >= ?`,
      )
        .bind(day7d)
        .first<{ count: number }>(),
      env.D1.prepare(
        `SELECT COUNT(*) AS count FROM audit_log WHERE created_at >= ?`,
      )
        .bind(day30d)
        .first<{ count: number }>(),
      env.D1.prepare(`SELECT COUNT(*) AS count FROM audit_log`).first<{
        count: number;
      }>(),
      env.D1.prepare(
        `SELECT actor, COUNT(*) AS action_count
         FROM audit_log
         WHERE created_at >= ?
         GROUP BY actor
         ORDER BY action_count DESC
         LIMIT 10`,
      )
        .bind(day30d)
        .all<{ actor: string; action_count: number }>(),
      env.D1.prepare(
        `SELECT COUNT(*) AS count FROM audit_log
         WHERE created_at >= ?
         AND (action LIKE '%reject%' OR action LIKE '%fail%' OR action LIKE '%error%' OR action LIKE '%denied%')`,
      )
        .bind(day7d)
        .first<{ count: number }>(),
      env.D1.prepare(
        `SELECT id, actor, action, object_type, object_id, created_at
         FROM audit_log
         WHERE action IN ('login_failed', 'auth_failed', 'permission_denied', 'unauthorized_access', 'data_breach_attempt', 'brute_force', 'suspicious_activity')
         OR action LIKE '%unauthorized%'
         OR action LIKE '%forbidden%'
         OR action LIKE '%breach%'
         ORDER BY created_at DESC
         LIMIT 20`,
      ).all<{
        id: string;
        actor: string;
        action: string;
        object_type: string;
        object_id: string;
        created_at: string;
      }>(),
    ]);

    return c.json({
      counts: {
        total: totalResult?.count ?? 0,
        last_24h: count24hResult?.count ?? 0,
        last_7d: count7dResult?.count ?? 0,
        last_30d: count30dResult?.count ?? 0,
      },
      top_actors: topActorsResult.results ?? [],
      failed_attempts: failedActionsResult?.count ?? 0,
      recent_suspicious: (recentSuspiciousResult.results ?? []).map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        object_type: row.object_type,
        object_id: row.object_id,
        created_at: row.created_at,
      })),
    });
  }),
);
