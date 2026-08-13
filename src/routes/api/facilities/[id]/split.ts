import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const facilitiesSplitRoute = new Hono<{ Bindings: Env }>();

facilitiesSplitRoute.post(
  "/:id/split",
  requireAuth,
  requireRole("OPERATOR", "ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id || !UUID_REGEX.test(id)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid facility card ID UUID is required" } }, 400);
    }

    const body = await c.req.json();
    const reportIds = Array.isArray(body.report_ids) ? body.report_ids : [];
    const reason = String(body.reason ?? "");

    if (reportIds.length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "report_ids must contain at least one report ID to split out" } }, 400);
    }

    for (const rid of reportIds) {
      if (!UUID_REGEX.test(String(rid))) {
        return c.json({ error: { code: "VALIDATION_ERROR", message: "All report IDs must be valid UUIDs" } }, 400);
      }
    }

    const result = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const cardR = await client.query("SELECT id FROM facility_cards WHERE id = $1", [id]);
        if (!cardR.rows[0]) {
          await client.query("ROLLBACK");
          return { error: "not_found" as const };
        }

        for (const reportId of reportIds) {
          const reportR = await client.query(
            "SELECT id FROM reports WHERE id = $1 AND facility_card_id = $2",
            [reportId, id]
          );
          if (!reportR.rows[0]) {
            await client.query("ROLLBACK");
            return { error: "report_not_in_card" as const, id: reportId };
          }
        }

        for (const reportId of reportIds) {
          await client.query(
            `UPDATE reports SET facility_card_id = NULL, updated_at = NOW() WHERE id = $1`,
            [reportId]
          );
        }

        const remainingR = await client.query(
          "SELECT COUNT(*)::int AS count FROM reports WHERE facility_card_id = $1",
          [id]
        );

        if (remainingR.rows[0].count === 0) {
          await client.query("DELETE FROM facility_cards WHERE id = $1", [id]);
          await client.query("COMMIT");
          return { split: true, card_deleted: true, card_id: id, split_report_ids: reportIds };
        }

        await client.query("COMMIT");
        return { split: true, card_deleted: false, card_id: id, split_report_ids: reportIds };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result && "error" in result) {
      if (result.error === "not_found") {
        return c.json({ error: { code: "NOT_FOUND", message: "Facility card not found" } }, 404);
      }
      if (result.error === "report_not_in_card") {
        return c.json({ error: { code: "NOT_FOUND", message: `Report ${result.id} is not part of this facility card` } }, 404);
      }
    }

    await appendAudit(c.env, {
      actor: user.sub,
      action: "facility_card_split",
      objectType: "facility_card",
      objectId: id,
      after: result,
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, error: e, context: "audit_write_failed" }));

    return c.json(result);
  }),
);
