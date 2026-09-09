import type { Env } from "@/types/bindings";
import { generateId } from "@/lib/id";
import { logger } from "@/lib/logger";

export const XP_VALUES: Record<string, number> = {
  new_report: 10,
  corroboration: 4,
  status_changing_update: 8,
  self_status_changing_update: 4,
};

export function computeLevel(xp: number): number {
  if (xp >= 1200) return 6;
  if (xp >= 700) return 5;
  if (xp >= 350) return 4;
  if (xp >= 150) return 3;
  if (xp >= 50) return 2;
  return 1;
}

export async function awardXp(
  env: Env,
  params: {
    userId: string;
    contributionId: string;
    type: keyof typeof XP_VALUES;
    idempotencyKey: string;
    reason: string;
  },
): Promise<void> {
  try {
    const xp = XP_VALUES[params.type];
    if (xp === undefined) return;

    const result = await env.D1.prepare(
      `INSERT INTO xp_ledger (id, user_id, contribution_id, contribution_type, xp, kind, reason, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, datetime('now'))
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
      .bind(
        generateId(),
        params.userId,
        params.contributionId,
        params.type,
        xp,
        params.reason,
        params.idempotencyKey,
      )
      .run();

    if (result.meta?.changes === 0) return;

    const typeCounter =
      params.type === "status_changing_update"
        ? "status_changing_accepted"
        : params.type === "corroboration"
          ? "corroboration_accepted"
          : "new_report_accepted";

    await env.D1.prepare(
      `INSERT INTO gamification_profiles (user_id, ${typeCounter}, xp_reached_at, updated_at)
       VALUES (?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         ${typeCounter} = ${typeCounter} + 1,
         xp_reached_at = COALESCE(xp_reached_at, datetime('now')),
         updated_at = datetime('now')`,
    )
      .bind(params.userId)
      .run();

    await evaluateBadges(env, params.userId);
  } catch (e) {
    logger.error({
      route: "gamification",
      method: "awardXp",
      error: e instanceof Error ? e : new Error(String(e)),
      user_id: params.userId,
    });
  }
}

export async function recordAdjudication(
  env: Env,
  userId: string | null | undefined,
  contributionId: string,
  accepted: boolean,
): Promise<void> {
  if (!userId) return;
  try {
    await env.D1.prepare(
      `INSERT INTO gamification_profiles (user_id, total_adjudicated, updated_at)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         total_adjudicated = total_adjudicated + 1,
         updated_at = datetime('now')`,
    )
      .bind(userId)
      .run();

    if (accepted) {
      await env.D1.prepare(
        `INSERT INTO gamification_profiles (user_id, accepted_adjudicated, updated_at)
         VALUES (?, 1, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           accepted_adjudicated = accepted_adjudicated + 1,
           updated_at = datetime('now')`,
      )
        .bind(userId)
        .run();
    }
  } catch (e) {
    logger.error({
      route: "gamification",
      method: "recordAdjudication",
      error: e instanceof Error ? e : new Error(String(e)),
      user_id: userId,
    });
  }
}

export async function evaluateBadges(
  env: Env,
  userId: string,
): Promise<void> {
  try {
    const profile = await env.D1.prepare(
      `SELECT accepted_adjudicated, total_adjudicated, corroboration_accepted, status_changing_accepted
       FROM gamification_profiles WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{
        accepted_adjudicated: number;
        total_adjudicated: number;
        corroboration_accepted: number;
        status_changing_accepted: number;
      }>();

    if (!profile) return;

    const badges: Array<{ key: string; met: boolean }> = [
      { key: "first_accepted", met: profile.accepted_adjudicated >= 1 },
      { key: "active_contributor", met: profile.accepted_adjudicated >= 10 },
      { key: "evidence_strength", met: profile.corroboration_accepted >= 10 },
      { key: "condition_updater", met: profile.status_changing_accepted >= 5 },
      {
        key: "high_reliability",
        met:
          profile.total_adjudicated >= 20 &&
          profile.total_adjudicated > 0 &&
          profile.accepted_adjudicated / profile.total_adjudicated >= 0.9,
      },
    ];

    for (const badge of badges) {
      if (!badge.met) continue;
      await env.D1.prepare(
        `INSERT INTO gamification_badges (id, user_id, badge_key, awarded_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, badge_key) DO NOTHING`,
      )
        .bind(generateId(), userId, badge.key)
        .run();
    }
  } catch (e) {
    logger.error({
      route: "gamification",
      method: "evaluateBadges",
      error: e instanceof Error ? e : new Error(String(e)),
      user_id: userId,
    });
  }
}

export async function getUserXp(
  env: Env,
  userId: string,
): Promise<number> {
  try {
    const row = await env.D1.prepare(
      `SELECT COALESCE(SUM(xp), 0) AS total FROM xp_ledger WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ total: number }>();
    return row?.total ?? 0;
  } catch (e) {
    logger.error({
      route: "gamification",
      method: "getUserXp",
      error: e instanceof Error ? e : new Error(String(e)),
      user_id: userId,
    });
    return 0;
  }
}

export async function getReputation(
  env: Env,
  userId: string,
): Promise<number | null> {
  try {
    const profile = await env.D1.prepare(
      `SELECT accepted_adjudicated, total_adjudicated FROM gamification_profiles WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ accepted_adjudicated: number; total_adjudicated: number }>();
    if (!profile || profile.total_adjudicated < 5) return null;
    return (
      Math.round((profile.accepted_adjudicated / profile.total_adjudicated) * 100) / 100
    );
  } catch (e) {
    logger.error({
      route: "gamification",
      method: "getReputation",
      error: e instanceof Error ? e : new Error(String(e)),
      user_id: userId,
    });
    return null;
  }
}

export async function reverseContribution(
  env: Env,
  contributionId: string,
  _adminSub: string,
  reason: string,
): Promise<{ reversed: number; summary: Array<{ id: string; originalXp: number }> }> {
  const creditRows = await env.D1.prepare(
    `SELECT id, user_id, contribution_type, xp, idempotency_key
     FROM xp_ledger WHERE contribution_id = ? AND kind = 'credit'`,
  )
    .bind(contributionId)
    .all<{
      id: string;
      user_id: string;
      contribution_type: string;
      xp: number;
      idempotency_key: string;
    }>();

  if (!creditRows.results || creditRows.results.length === 0) {
    throw new GamificationNotFoundError("No XP credit found for this contribution");
  }

  const statements: D1PreparedStatement[] = [];
  const summary: Array<{ id: string; originalXp: number }> = [];

  for (const row of creditRows.results) {
    const reversalKey = `reversal:${row.idempotency_key}`;
    const existing = await env.D1.prepare(
      `SELECT 1 FROM xp_ledger WHERE idempotency_key = ?`,
    )
      .bind(reversalKey)
      .first();

    if (existing) continue;

    statements.push(
      env.D1.prepare(
        `INSERT INTO xp_ledger (id, user_id, contribution_id, contribution_type, xp, kind, reason, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, 'reversal', ?, ?, datetime('now'))
         ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        generateId(),
        row.user_id,
        contributionId,
        row.contribution_type,
        -row.xp,
        reason,
        reversalKey,
      ),
    );
    summary.push({ id: row.id, originalXp: row.xp });
  }

  if (summary.length === 0) {
    throw new GamificationNotFoundError("All XP credits for this contribution already reversed");
  }

  statements.push(
    env.D1.prepare(
      `UPDATE gamification_profiles SET
         accepted_adjudicated = MAX(0, accepted_adjudicated - 1),
         updated_at = datetime('now')
       WHERE user_id = (SELECT user_id FROM xp_ledger WHERE contribution_id = ? AND kind = 'credit' LIMIT 1)`,
    ).bind(contributionId),
  );

  const typeCounters = [
    "new_report_accepted",
    "corroboration_accepted",
    "status_changing_accepted",
  ];
  for (const counter of typeCounters) {
    statements.push(
      env.D1.prepare(
        `UPDATE gamification_profiles SET
           ${counter} = MAX(0, ${counter} - 1),
           updated_at = datetime('now')
         WHERE user_id = (SELECT user_id FROM xp_ledger WHERE contribution_id = ? AND kind = 'credit' LIMIT 1)
           AND ${counter} > 0`,
      ).bind(contributionId),
    );
  }

  await env.D1.batch(statements);

  const targetUser = await env.D1.prepare(
    `SELECT user_id FROM xp_ledger WHERE contribution_id = ? AND kind = 'credit' LIMIT 1`,
  )
    .bind(contributionId)
    .first<{ user_id: string }>();

  if (targetUser) {
    await evaluateBadges(env, targetUser.user_id);
  }

  return { reversed: summary.length, summary };
}

class GamificationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GamificationNotFoundError";
  }
}

type D1PreparedStatement = Parameters<D1Database["batch"]>[0][number];
