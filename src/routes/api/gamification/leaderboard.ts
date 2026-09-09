import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { rateLimit } from "@/lib/ratelimit";
import { computeLevel } from "@/lib/gamification";

const gamificationLeaderboardRoutes = new Hono<{ Bindings: Env }>();

gamificationLeaderboardRoutes.use(
  "/users",
  rateLimit({
    limit: 30,
    windowMs: 60_000,
    keyBy: (c) =>
      c.req.header("Authorization") ??
      (c.req.header("CF-Connecting-IP") ?? "anon"),
  }),
);

gamificationLeaderboardRoutes.get(
  "/users",
  safeHandler(async (c) => {
    const rows = await c.env.D1.prepare(
      `SELECT u.name, p.user_id, p.status_changing_accepted, p.accepted_adjudicated, p.total_adjudicated, p.xp_reached_at,
              (SELECT COALESCE(SUM(xp), 0) FROM xp_ledger WHERE user_id = p.user_id) AS xp
       FROM gamification_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.leaderboard_opt_in = 1
         AND p.abuse_flag = 0
         AND p.total_adjudicated >= 5
         AND CAST(p.accepted_adjudicated AS REAL) / p.total_adjudicated >= 0.7
         AND u.disabled = 0
         AND u.deleted_at IS NULL
       ORDER BY xp DESC,
                CAST(p.accepted_adjudicated AS REAL) / MAX(p.total_adjudicated, 1) DESC,
                p.status_changing_accepted DESC,
                p.xp_reached_at ASC
       LIMIT 50`,
    )
      .all<{
        name: string;
        user_id: string;
        status_changing_accepted: number;
        accepted_adjudicated: number;
        total_adjudicated: number;
        xp_reached_at: string | null;
        xp: number;
      }>();

    const leaderboard = (rows.results ?? []).map((row, idx) => {
      const rep =
        row.total_adjudicated >= 5
          ? Math.round((row.accepted_adjudicated / row.total_adjudicated) * 100) / 100
          : null;
      return {
        rank: idx + 1,
        name: row.name,
        xp: row.xp,
        level: computeLevel(row.xp),
        reputation: rep,
        status_changing_accepted: row.status_changing_accepted,
      };
    });

    return c.json({ leaderboard });
  }),
);

gamificationLeaderboardRoutes.use(
  "/kecamatan",
  rateLimit({
    limit: 30,
    windowMs: 60_000,
    keyBy: (c) =>
      c.req.header("Authorization") ??
      (c.req.header("CF-Connecting-IP") ?? "anon"),
  }),
);

gamificationLeaderboardRoutes.get(
  "/kecamatan",
  safeHandler(async (c) => {
    const kecamatanRows = await c.env.D1.prepare(
      `SELECT kecamatan,
              COUNT(CASE WHEN status IN ('verified','assigned','in_progress','resolved','closed') THEN 1 END) AS accepted_contributions,
              COUNT(DISTINCT CASE WHEN status IN ('verified','assigned','in_progress','resolved','closed') THEN reporter_id END) AS unique_contributors,
              COUNT(CASE WHEN status IN ('verified','assigned','in_progress','resolved','closed','rejected','duplicate_merged') THEN 1 END) AS adjudicated_total,
              MIN(created_at) AS first_created_at
       FROM reports
       WHERE kecamatan IS NOT NULL AND TRIM(kecamatan) != ''
       GROUP BY kecamatan`,
    )
      .all<{
        kecamatan: string;
        accepted_contributions: number;
        unique_contributors: number;
        adjudicated_total: number;
        first_created_at: string;
      }>();

    const popRow = await c.env.D1.prepare(
      `SELECT COUNT(DISTINCT r.reporter_id) AS total
       FROM reports r
       JOIN users u ON u.id = r.reporter_id
       WHERE u.role = 'WARGA' AND u.disabled = 0 AND u.deleted_at IS NULL`,
    )
      .first<{ total: number }>();

    const population = popRow?.total ?? 0;
    const now = Date.now();

    const entries = (kecamatanRows.results ?? []).map((row) => {
      const firstDate = new Date(row.first_created_at).getTime();
      const activeMonths = Math.max(
        1,
        Math.round((now - firstDate) / (30 * 24 * 60 * 60 * 1000)),
      );
      const popK = population / 1000;
      const activityRate =
        popK > 0 ? row.accepted_contributions / (popK * activeMonths) : 0;
      const participationRate =
        popK > 0 ? row.unique_contributors / (popK * activeMonths) : 0;
      const qualityRate =
        row.adjudicated_total > 0
          ? row.accepted_contributions / row.adjudicated_total
          : 0;

      return {
        kecamatan: row.kecamatan,
        accepted_contributions: row.accepted_contributions,
        unique_contributors: row.unique_contributors,
        adjudicated_total: row.adjudicated_total,
        active_months: activeMonths,
        activity_rate: activityRate,
        participation_rate: participationRate,
        quality_rate: qualityRate,
        activity_percentile: 0,
        participation_percentile: 0,
        score: 0,
      };
    });

    const n = entries.length;
    const percentileRank = (values: number[], v: number): number => {
      if (values.length === 0) return 0;
      const below = values.filter((x) => x < v).length;
      const equal = values.filter((x) => x === v).length;
      return (below + (equal - 1) / 2) / values.length;
    };
    const activityValues = entries.map((e) => e.activity_rate);
    const participationValues = entries.map((e) => e.participation_rate);
    for (const entry of entries) {
      entry.activity_percentile = percentileRank(activityValues, entry.activity_rate);
      entry.participation_percentile = percentileRank(
        participationValues,
        entry.participation_rate,
      );
    }

    for (const entry of entries) {
      entry.score =
        Math.round(
          (50 * entry.activity_percentile +
            30 * entry.participation_percentile +
            20 * entry.quality_rate) *
            100,
        ) / 100;
    }

    entries.sort((a, b) => b.score - a.score);

    return c.json({
      leaderboard: entries.map((e) => ({
        kecamatan: e.kecamatan,
        score: e.score,
        activity_rate: Math.round(e.activity_rate * 10000) / 10000,
        participation_rate: Math.round(e.participation_rate * 10000) / 10000,
        quality_rate: Math.round(e.quality_rate * 100) / 100,
        activity_percentile: Math.round(e.activity_percentile * 100) / 100,
        participation_percentile:
          Math.round(e.participation_percentile * 100) / 100,
        accepted_contributions: e.accepted_contributions,
        unique_contributors: e.unique_contributors,
        adjudicated_total: e.adjudicated_total,
        active_months: e.active_months,
        denominator_source: "verified_active_resident_accounts",
      })),
    });
  }),
);

export { gamificationLeaderboardRoutes };
