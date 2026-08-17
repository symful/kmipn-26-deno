import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import bcrypt from "bcryptjs";

export const testSeedRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const SEED_ACCOUNTS = [
  { email: "admin@sigap.live", password: "admin123", name: "Admin SIGAP", role: "ADMIN" as const },
  { email: "verifikator@sigap.live", password: "verifikator123", name: "Verifikator SIGAP", role: "VERIFIKATOR" as const },
  { email: "surveyor@sigap.live", password: "surveyor123", name: "Surveyor SIGAP", role: "SURVEYOR" as const },
  { email: "petugas@sigap.live", password: "petugas123", name: "Petugas SIGAP", role: "PETUGAS" as const },
  { email: "operator@sigap.live", password: "operator123", name: "Operator SIGAP", role: "OPERATOR" as const },
  { email: "admin_daerah@sigap.live", password: "admin_daerah123", name: "Admin Daerah SIGAP", role: "ADMIN_DAERAH" as const },
  { email: "auditor@sigap.live", password: "auditor123", name: "Auditor SIGAP", role: "AUDITOR" as const },
  { email: "exec@sigap.live", password: "exec1234", name: "Exec SIGAP", role: "PENGAMBIL_KEPUTUSAN" as const },
  { email: "warga@sigap.live", password: "warga123", name: "Warga SIGAP", role: "WARGA" as const },
];

testSeedRoute.post(
  "/",
  safeHandler(async (c) => {
    if (c.env.ENABLE_TEST_RESET !== "true") {
      return c.json({ error: { code: "FORBIDDEN", message: "Test seed is not enabled" } }, 403);
    }

    const testSecret = c.req.header("X-Test-Secret");
    if (!testSecret || testSecret !== c.env.TEST_RESET_SECRET) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid test secret" } }, 401);
    }

    let usersCreated = 0;
    let wilayahCreated = 0;

    await withClient(c.env, async (client) => {
      for (const acct of SEED_ACCOUNTS) {
        try {
          const hash = await bcrypt.hash(acct.password, 4);
          const r = await client.query(
            `INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             ON CONFLICT (email) DO NOTHING RETURNING id`,
            [acct.email, hash, acct.name, acct.role]
          );
          if (r.rowCount !== null && r.rowCount > 0) usersCreated++;
        } catch (err) {
          logger.warn({ route: c.req.path, method: c.req.method, action: "seed_user", email: acct.email, error: err as Error });
        }
      }

      try {
        const provR = await client.query(
          `INSERT INTO wilayah (level, name) VALUES ('PROVINSI', 'Jawa Barat') ON CONFLICT DO NOTHING RETURNING id`
        );
        if (provR.rowCount !== null && provR.rowCount > 0) wilayahCreated++;
        const provId = provR.rows[0]?.id;
        if (!provId) {
          const ex = await client.query(`SELECT id FROM wilayah WHERE name = 'Jawa Barat' AND level = 'PROVINSI' LIMIT 1`);
          if (ex.rows[0]) {
            const kabR = await client.query(
              `INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'KABUPATEN', 'Bandung') ON CONFLICT DO NOTHING RETURNING id`,
              [ex.rows[0].id]
            );
            if (kabR.rowCount !== null && kabR.rowCount > 0) wilayahCreated++;
          }
        } else {
          const kabR = await client.query(
            `INSERT INTO wilayah (parent_id, level, name) VALUES ($1, 'KABUPATEN', 'Bandung') ON CONFLICT DO NOTHING RETURNING id`,
            [provId]
          );
          if (kabR.rowCount !== null && kabR.rowCount > 0) wilayahCreated++;
        }
      } catch (err) {
        logger.warn({ route: c.req.path, method: c.req.method, action: "seed_wilayah", error: err as Error });
      }
    });

    try {
      await appendAudit(c.env, { activeRole: c.get("user").role,
        actor: "test_seed",
        action: "test_seed_run",
        objectType: "system",
        objectId: "seed",
        after: { users: usersCreated, wilayah: wilayahCreated },
      });
    } catch (err) {
      logger.warn({ route: c.req.path, method: c.req.method, action: "audit_log_failed", error: err as Error });
    }

    return c.json({ created: { users: usersCreated, wilayah: wilayahCreated } });
  }),
);
