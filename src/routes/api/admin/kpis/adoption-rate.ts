import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { applyWilayahFilter } from "@/lib/rbac";

export const kpiAdoptionRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

kpiAdoptionRoute.get("/", requireAuth, requireRole("ADMIN", "ADMIN_DAERAH"), safeHandler(async (c) => {
  const user = c.get("user");
  const queryWilayahId = c.req.query("wilayah_id");
  const result = await withClient(c.env, async (client) => {
    const activeUsersQuery = `
      SELECT COUNT(DISTINCT reporter_id)::int AS active_users
      FROM reports
      WHERE created_at > NOW() - INTERVAL '30 days'
    `;
    const wilayahScope = user.role === "ADMIN_DAERAH" ? user.wilayah_id : (queryWilayahId ?? null);
    const { sql: usersSql, params: usersParams } = applyWilayahFilter(activeUsersQuery, [], wilayahScope, "r");

    const wilayahQuery = wilayahScope
      ? `SELECT population FROM wilayah WHERE id = $1`
      : `SELECT COALESCE(SUM(population), 0)::bigint AS population FROM wilayah`;
    const wilayahParams = wilayahScope ? [wilayahScope] : [];

    const [usersResult, wilayahResult] = await Promise.all([
      client.query(usersSql, usersParams),
      wilayahQuery.includes('$1') ? client.query(wilayahQuery, wilayahParams) : client.query(wilayahQuery),
    ]);

    return {
      active_users: usersResult.rows[0]?.active_users ?? 0,
      population: wilayahResult.rows[0]?.population ?? 1,
    };
  });
  const active = result.active_users;
  const pop = Number(result.population) || 1;
  return c.json({
    active_users_30d: active,
    population: pop,
    adoption_rate: Math.round((active / pop) * 100 * 100) / 100,
    period: "30d",
  });
}));
