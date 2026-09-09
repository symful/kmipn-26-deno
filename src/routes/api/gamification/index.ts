import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import {
  getUserXp,
  getReputation,
  computeLevel,
} from "@/lib/gamification";

const gamificationRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

gamificationRoute.get(
  "/me",
  safeHandler(async (c) => {
    const user = c.get("user");

    const xp = await getUserXp(c.env, user.sub);
    const reputation = await getReputation(c.env, user.sub);

    const profile = await c.env.D1.prepare(
      `SELECT leaderboard_opt_in, new_report_accepted, corroboration_accepted, status_changing_accepted
       FROM gamification_profiles WHERE user_id = ?`,
    )
      .bind(user.sub)
      .first<{
        leaderboard_opt_in: number;
        new_report_accepted: number;
        corroboration_accepted: number;
        status_changing_accepted: number;
      }>();

    const badges = await c.env.D1.prepare(
      `SELECT badge_key, awarded_at FROM gamification_badges WHERE user_id = ?`,
    )
      .bind(user.sub)
      .all<{ badge_key: string; awarded_at: string }>();

    return c.json({
      xp,
      level: computeLevel(xp),
      reputation: reputation !== null
        ? {
            accepted: profile?.new_report_accepted ?? 0,
            total: (profile?.new_report_accepted ?? 0) + (profile?.corroboration_accepted ?? 0) + (profile?.status_changing_accepted ?? 0),
            value: reputation,
          }
        : null,
      badges: (badges.results ?? []).map((b) => ({
        badge_key: b.badge_key,
        awarded_at: b.awarded_at,
      })),
      leaderboard_opt_in: (profile?.leaderboard_opt_in ?? 0) === 1,
      contribution_counts: {
        new_report_accepted: profile?.new_report_accepted ?? 0,
        corroboration_accepted: profile?.corroboration_accepted ?? 0,
        status_changing_accepted: profile?.status_changing_accepted ?? 0,
      },
    });
  }),
);

const OptInSchema = z.object({
  opt_in: z.boolean(),
});

gamificationRoute.post(
  "/opt-in",
  safeHandler(async (c) => {
    const user = c.get("user");
    const { opt_in } = await c.req.json().then((b) => OptInSchema.parse(b));

    await c.env.D1.prepare(
      `INSERT INTO gamification_profiles (user_id, leaderboard_opt_in, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         leaderboard_opt_in = ?,
         updated_at = datetime('now')`,
    )
      .bind(user.sub, opt_in ? 1 : 0, opt_in ? 1 : 0)
      .run();

    return c.json({ success: true, leaderboard_opt_in: opt_in });
  }),
);

const ReverseSchema = z.object({
  contribution_id: z.string().min(1),
  reason: z.string().min(5),
});

gamificationRoute.post(
  "/admin/reverse",
  safeHandler(async (c) => {
    const user = c.get("user");
    if (user.role !== "ADMIN") {
      return c.json({ error: { code: "FORBIDDEN", message: "Admin only" } }, 403);
    }

    const body = await c.req.json().then((b) => ReverseSchema.parse(b));

    const { reverseContribution } = await import("@/lib/gamification");
    const result = await reverseContribution(
      c.env,
      body.contribution_id,
      user.sub,
      body.reason,
    );

    await appendAudit(c.env, {
      actor: user.sub,
      activeRole: user.role,
      action: "gamification_xp_reversed",
      objectType: "xp_ledger",
      objectId: body.contribution_id,
      after: { reason: body.reason, reversed_xp: result.reversed },
    }).catch((e) =>
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: e,
        context: "audit_write_failed",
      }),
    );

    return c.json({ success: true, reversed: result.reversed });
  }),
);

export { gamificationRoute };
