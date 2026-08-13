import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const auditorStatsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

auditorStatsRoute.get(
  "/stats",
  requireAuth,
  requireRole("AUDITOR", "ADMIN"),
  safeHandler(async (c) => {
    const result = await withClient(c.env, async (client) => {
      const now = new Date();
      const day24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const day7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const day30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        count24hResult,
        count7dResult,
        count30dResult,
        totalResult,
        topActorsResult,
        failedActionsResult,
        recentSuspiciousResult,
      ] = await Promise.all([
        client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM audit_log WHERE created_at >= $1`,
          [day24h.toISOString()]
        ),
        client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM audit_log WHERE created_at >= $1`,
          [day7d.toISOString()]
        ),
        client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM audit_log WHERE created_at >= $1`,
          [day30d.toISOString()]
        ),
        client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM audit_log`),
        client.query<{ actor: string; action_count: number }>(
          `SELECT actor, COUNT(*)::int AS action_count
           FROM audit_log
           WHERE created_at >= $1
           GROUP BY actor
           ORDER BY action_count DESC
           LIMIT 10`,
          [day30d.toISOString()]
        ),
        client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM audit_log
           WHERE created_at >= $1
           AND (action LIKE '%reject%' OR action LIKE '%fail%' OR action LIKE '%error%' OR action LIKE '%denied%')`,
          [day7d.toISOString()]
        ),
        client.query<{
          id: string;
          actor: string;
          action: string;
          object_type: string;
          object_id: string;
          created_at: string;
        }>(
          `SELECT id, actor, action, object_type, object_id, created_at
           FROM audit_log
           WHERE action IN ('login_failed', 'auth_failed', 'permission_denied', 'unauthorized_access', 'data_breach_attempt', 'brute_force', 'suspicious_activity')
           OR action LIKE '%unauthorized%'
           OR action LIKE '%forbidden%'
           OR action LIKE '%breach%'
           ORDER BY created_at DESC
           LIMIT 20`,
        ),
      ]);

      return {
        counts: {
          total: totalResult.rows[0]?.count ?? 0,
          last_24h: count24hResult.rows[0]?.count ?? 0,
          last_7d: count7dResult.rows[0]?.count ?? 0,
          last_30d: count30dResult.rows[0]?.count ?? 0,
        },
        top_actors: topActorsResult.rows,
        failed_attempts: failedActionsResult.rows[0]?.count ?? 0,
        recent_suspicious: recentSuspiciousResult.rows.map((row) => ({
          id: row.id,
          actor: row.actor,
          action: row.action,
          object_type: row.object_type,
          object_id: row.object_id,
          created_at: row.created_at,
        })),
      };
    });

    return c.json(result);
  }),
);
