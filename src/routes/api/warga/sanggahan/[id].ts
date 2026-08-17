import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { APPEALABLE_STATES } from "@/types/case-states";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SanggahanSchema = z.object({
  reason: z.string().min(10, "Alasan sanggahan minimal 10 karakter"),
});

export const wargaSanggahanRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

wargaSanggahanRoute.post("/", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");
  const reportId = c.req.param("id");

  if (!reportId || !UUID_REGEX.test(reportId)) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "ID laporan tidak valid" } }, 400);
  }

  const body = await c.req.json();
  const parsed = SanggahanSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.errors[0]?.message || "Data tidak valid" } }, 400);
  }

  const result = await withClient(c.env, async (client) => {
    await client.query("BEGIN");
    try {
      // Check report exists and ownership
      const reportR = await client.query(
        "SELECT id, status, reporter_id FROM reports WHERE id = $1",
        [reportId]
      );
      if (!reportR.rows[0]) {
        await client.query("ROLLBACK");
        return { notFound: true };
      }
      const report = reportR.rows[0];

      // Check ownership
      if (report.reporter_id !== user.sub) {
        await client.query("ROLLBACK");
        return { forbidden: true };
      }

      // Check if report is in a state that allows sanggahan
      const currentStatus = report.status as string;
      if (!APPEALABLE_STATES.includes(currentStatus as typeof APPEALABLE_STATES[number])) {
        await client.query("ROLLBACK");
        return { invalidState: true, current: currentStatus };
      }

      // Check if there's already an active sanggahan (sanggahan_filed without resolution)
      const existingSanggahanR = await client.query(
        `SELECT id FROM case_events WHERE report_id = $1 AND event_type = 'sanggahan_filed' 
         AND id NOT IN (
           SELECT id FROM case_events WHERE report_id = $1 AND event_type IN ('sanggahan_accepted', 'sanggahan_rejected')
         )`,
        [reportId]
      );
      if (existingSanggahanR.rows[0]) {
        await client.query("ROLLBACK");
        return { alreadyExists: true };
      }

      // Create sanggahan record via case_events
      const eventR = await client.query<{ id: string }>(
        `INSERT INTO case_events (report_id, event_type, actor_id, occurred_at)
         VALUES ($1, 'sanggahan_filed', $2, NOW())
         RETURNING id`,
        [reportId, user.sub]
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
    return c.json({ error: { code: "INVALID_STATE", message: `Tidak dapat mengajukan sanggahan untuk laporan dalam status '${result.current}'` } }, 400);
  }
  if (result?.alreadyExists) {
    return c.json({ error: { code: "ALREADY_EXISTS", message: "Sanggahan sudah pernah diajukan untuk laporan ini" } }, 409);
  }

  await appendAudit(c.env, { activeRole: c.get("user").role,
    actor: user.sub,
    action: "warga_sanggahan_filed",
    objectType: "report",
    objectId: reportId,
    after: { reason: parsed.data.reason },
  }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, audit_failure: true, err: e }));

  return c.json({ success: true, id: result!.id }, 201);
}));
