import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcryptjs";

const TABLES_TO_TRUNCATE = [
  "audit_log",
  "ai_call_log",
  "outbox",
  "outbox_reconciliations",
  "agent_assessments",
  "reports",
  "report_shares",
  "report_retention_policy",
  "case_events",
  "consent_records",
  "consent_retry_queue",
  "facility_cards",
  "notifications",
  "revoked_tokens",
  "refresh_tokens",
  "priority_config",
  "priority_formula_versions",
  "priority_scores",
  "sla_rules",
  "surveyor_tasks",
  "survey_visits",
  "units",
  "unit_members",
  "sync_outcomes",
  "webhook_idempotency",
  "webhook_dead_letter",
  "users",
];

const SEED_ACCOUNTS = [
  { email: "admin@sigap.live", password: "admin123", name: "Admin SIGAP", role: "ADMIN" },
  { email: "verifikator@sigap.live", password: "verifikator123", name: "Verifikator SIGAP", role: "VERIFIKATOR" },
  { email: "operator@sigap.live", password: "operator123", name: "Operator SIGAP", role: "OPERATOR" },
  { email: "surveyor@sigap.live", password: "surveyor123", name: "Surveyor SIGAP", role: "SURVEYOR" },
  { email: "petugas@sigap.live", password: "petugas123", name: "Petugas SIGAP", role: "PETUGAS" },
  { email: "admin_daerah@sigap.live", password: "admin_daerah123", name: "Admin Daerah SIGAP", role: "ADMIN_DAERAH" },
  { email: "auditor@sigap.live", password: "auditor123", name: "Auditor SIGAP", role: "AUDITOR" },
  { email: "exec@sigap.live", password: "exec1234", name: "Exec SIGAP", role: "PENGAMBIL_KEPUTUSAN" },
  { email: "warga@sigap.live", password: "warga123", name: "Warga SIGAP", role: "WARGA" },
];

export const testResetRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

testResetRoute.post(
  "/",
  safeHandler(async (c) => {
    if (c.env.ENABLE_TEST_RESET !== "true") {
      return c.json({ error: { code: "FORBIDDEN", message: "Test reset is not enabled" } }, 403);
    }

    const testSecret = c.req.header("X-Test-Secret");
    if (!testSecret || testSecret !== c.env.TEST_RESET_SECRET) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid test secret" } }, 401);
    }

    let truncated = 0;
    let seeded = 0;

    try {
      await withClient(c.env, async (client) => {
        for (const table of TABLES_TO_TRUNCATE) {
          try {
            await client.query(`DELETE FROM ${table} WHERE 1=1`);
            truncated++;
          } catch (err) {
            logger.warn({ route: c.req.path, method: c.req.method, action: "delete", table, error: err as Error });
          }
        }

        for (const acct of SEED_ACCOUNTS) {
          try {
            const hash = await bcrypt.hash(acct.password, 4);
            await client.query(
              "INSERT INTO users (email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
              [acct.email, hash, acct.name, acct.role]
            );
            seeded++;
          } catch (err) {
            logger.warn({ route: c.req.path, method: c.req.method, action: "seed_user", email: acct.email, error: err as Error });
          }
        }

        // Seed wilayah hierarchy with geom
        try {
          const provR = await client.query(
            "INSERT INTO wilayah (level, name, geom) VALUES ('PROVINSI', 'Jawa Barat', ST_GeomFromText('POLYGON((106.0 -7.5, 108.5 -7.5, 108.5 -6.0, 106.0 -6.0, 106.0 -7.5))', 4326)) ON CONFLICT DO NOTHING RETURNING id"
          );
          let provId = provR.rows[0]?.id;
          if (!provId) {
            const existing = await client.query("SELECT id FROM wilayah WHERE name = 'Jawa Barat' AND level = 'PROVINSI' LIMIT 1");
            provId = existing.rows[0]?.id;
          }
          const kabR = await client.query(
            "INSERT INTO wilayah (parent_id, level, name, geom) VALUES ($1, 'KABUPATEN', 'Bandung', ST_GeomFromText('POLYGON((106.5 -7.0, 108.0 -7.0, 108.0 -6.3, 106.5 -6.3, 106.5 -7.0))', 4326)) ON CONFLICT DO NOTHING RETURNING id",
            [provId]
          );
          let kabId = kabR.rows[0]?.id;
          if (!kabId) {
            const existing = await client.query("SELECT id FROM wilayah WHERE name = 'Bandung' AND level = 'KABUPATEN' LIMIT 1");
            kabId = existing.rows[0]?.id;
          }
          const kecR = await client.query(
            "INSERT INTO wilayah (parent_id, level, name, geom) VALUES ($1, 'KECAMATAN', 'Cisarua', ST_GeomFromText('POLYGON((106.5 -7.0, 108.0 -7.0, 108.0 -6.3, 106.5 -6.3, 106.5 -7.0))', 4326)) ON CONFLICT DO NOTHING RETURNING id",
            [kabId]
          );
          let kecId = kecR.rows[0]?.id;
          if (!kecId) {
            const existing = await client.query("SELECT id FROM wilayah WHERE name = 'Cisarua' AND level = 'KECAMATAN' LIMIT 1");
            kecId = existing.rows[0]?.id;
          }
          await client.query(
            "INSERT INTO wilayah (parent_id, level, name, geom) VALUES ($1, 'DESA', 'Ciburuy', ST_GeomFromText('POLYGON((106.5 -7.0, 108.0 -7.0, 108.0 -6.3, 106.5 -6.3, 106.5 -7.0))', 4326)) ON CONFLICT DO NOTHING RETURNING id",
            [kecId]
          );
          seeded += 4;
        } catch (err) {
          logger.warn({ route: c.req.path, method: c.req.method, action: "seed_wilayah", error: err as Error });
        }
      });
    } catch (err) {
      logger.error({ route: c.req.path, method: c.req.method, action: "reset_main", error: err instanceof Error ? err : new Error(String(err)) });
    }

    let usersCount = 0;
    let catsCount = 0;
    try {
      const result = await withClient(c.env, async (client) => {
        const users = await client.query("SELECT COUNT(*) FROM users");
        const cats = await client.query("SELECT COUNT(*) FROM categories");
        return { users: parseInt(users.rows[0].count, 10), cats: parseInt(cats.rows[0].count, 10) };
      });
      usersCount = result.users;
      catsCount = result.cats;
    } catch (err) {
      logger.warn({ route: c.req.path, method: c.req.method, action: "count", error: err as Error });
    }

    return c.json({ success: true, truncated, seeded, users: usersCount, categories: catsCount });
  }),
);
