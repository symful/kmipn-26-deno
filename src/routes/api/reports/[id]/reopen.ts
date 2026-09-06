import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { REOPENABLE_STATES } from "@/types/case-states";
import { type AuthVariables } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { safeHandler } from "@/lib/safeHandler";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { generateId, ID_REGEX } from "@/lib/id";
import { parseJson } from "@/lib/validation";
import type { D1PreparedStatement } from "@cloudflare/workers-types";

const ReopenSchema = z.object({
  reason: z
    .string()
    .min(10, "Alasan permintaan buka ulang minimal 10 karakter"),
});

export const reopenRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

reopenRoute.post(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const reportId = c.req.param("id");

    if (!reportId || !ID_REGEX.test(reportId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "ID laporan tidak valid",
          },
        },
        400,
      );
    }

    const parsed = await parseJson(c, ReopenSchema);

    const reportR = await c.env.D1.prepare(
      "SELECT id, status, reporter_id FROM reports WHERE id = ?1",
    )
      .bind(reportId)
      .first<{ id: string; status: string; reporter_id: string }>();
    if (!reportR) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Laporan tidak ditemukan" } },
        404,
      );
    }

    if (reportR.reporter_id !== user.sub) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Anda bukan pemilik laporan ini",
          },
        },
        403,
      );
    }

    const currentStatus = reportR.status;
    if (
      !REOPENABLE_STATES.includes(
        currentStatus as (typeof REOPENABLE_STATES)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_STATE",
            message: `Tidak dapat meminta buka ulang untuk laporan dalam status '${currentStatus}'`,
          },
        },
        400,
      );
    }

    const existingR = await c.env.D1.prepare(
      `SELECT id FROM reopen_requests WHERE report_id = ?1 AND resolved_at IS NULL`,
    )
      .bind(reportId)
      .first<{ id: string }>();
    if (existingR) {
      return c.json(
        {
          error: {
            code: "ALREADY_EXISTS",
            message: "Permintaan buka ulang sudah ada untuk laporan ini",
          },
        },
        409,
      );
    }

    const statements: D1PreparedStatement[] = [];
    const reopenId = generateId();
    statements.push(
      c.env.D1.prepare(
        `INSERT INTO reopen_requests (id, report_id, reason, requester_id, created_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))`,
      ).bind(reopenId, reportId, parsed.reason, user.sub),
    );

    if (statements.length > 0) {
      await c.env.D1.batch(statements);
    }

    const insertedR = await c.env.D1.prepare(
      "SELECT id FROM reopen_requests WHERE id = ?1",
    )
      .bind(reopenId)
      .first<{ id: string }>();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: c.get("user").role,
        actor: user.sub,
        action: "warga_reopen_requested",
        objectType: "report",
        objectId: reportId,
        after: { reason: parsed.reason },
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          audit_failure: true,
          err: e,
        }),
      ),
    );

    return c.json({ success: true, id: insertedR?.id }, 201);
  }),
);
