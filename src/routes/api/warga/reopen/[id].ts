import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REOPENABLE_STATES = ["closed", "resolved"] as const;

const ReopenSchema = z.object({
  reason: z.string().min(10, "Alasan permintaan buka ulang minimal 10 karakter"),
});

export const wargaReopenRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

wargaReopenRoute.post("/:id", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");
  const reportId = c.req.param("id");

  if (!reportId || !UUID_REGEX.test(reportId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "ID laporan tidak valid" } }, 400);
  }

  const body = await c.req.json();
  const parsed = ReopenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0]?.message || "Data tidak valid" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      const reportR = await client.query(
        "SELECT id, status, reporter_id FROM reports WHERE id = $1",
        [reportId]
      );
      if (!reportR.rows[0]) {
        await client.query("ROLLBACK");
        return { notFound: true };
      }
      const report = reportR.rows[0];

      if (report.reporter_id !== user.sub) {
        await client.query("ROLLBACK");
        return { forbidden: true };
      }

      const currentStatus = report.status as string;
      if (!REOPENABLE_STATES.includes(currentStatus as typeof REOPENABLE_STATES[number])) {
        await client.query("ROLLBACK");
        return { invalidState: true, current: currentStatus };
      }

      const existingR = await client.query(
        `SELECT id FROM reopen_requests WHERE report_id = $1 AND resolved_at IS NULL`,
        [reportId]
      );
      if (existingR.rows[0]) {
        await client.query("ROLLBACK");
        return { alreadyExists: true };
      }

      const eventR = await client.query<{ id: string }>(
        `INSERT INTO reopen_requests (report_id, reason, created_by, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id`,
        [reportId, parsed.data.reason, user.sub]
      );

      await client.query("COMMIT");
      return { id: eventR.rows[0]!.id };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (result?.notFound) {
    return c.json({ error: { code: "NOT_FOUND", message: "Laporan tidak ditemukan" } }, 404);
  }
  if (result?.forbidden) {
    return c.json({ error: { code: "FORBIDDEN", message: "Anda bukan pemilik laporan ini" } }, 403);
  }
  if (result?.invalidState) {
    return c.json({ error: { code: "INVALID_STATE", message: `Tidak dapat meminta buka ulang untuk laporan dalam status '${result.current}'` } }, 400);
  }
  if (result?.alreadyExists) {
    return c.json({ error: { code: "ALREADY_EXISTS", message: "Permintaan buka ulang sudah ada untuk laporan ini" } }, 409);
  }

  await appendAudit(c.env, {
    actor: user.sub,
    action: "warga_reopen_requested",
    objectType: "report",
    objectId: reportId,
    after: { reason: parsed.data.reason },
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, err: e }));

  return c.json({ success: true, id: result!.id }, 201);
}));
