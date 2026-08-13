import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const facilitiesMergeRoute = new Hono<{ Bindings: Env }>();

facilitiesMergeRoute.post(
  "/:id/merge",
  requireAuth,
  requireRole("OPERATOR", "ADMIN"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id || !UUID_REGEX.test(id)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Valid facility card ID UUID is required" } }, 400);
    }

    const body = await c.req.json();
    const targetCardIds = Array.isArray(body.target_card_ids) ? body.target_card_ids : [];
    const reason = String(body.reason ?? "");

    if (targetCardIds.length === 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "target_card_ids must contain at least one facility card ID" } }, 400);
    }

    for (const cid of targetCardIds) {
      if (!UUID_REGEX.test(String(cid))) {
        return c.json({ error: { code: "VALIDATION_ERROR", message: "All facility card IDs must be valid UUIDs" } }, 400);
      }
    }

    const result = await withClient(c.env, async (client) => {
      await client.query("BEGIN");
      try {
        const sourceR = await client.query("SELECT id, status FROM facility_cards WHERE id = $1", [id]);
        if (!sourceR.rows[0]) {
          await client.query("ROLLBACK");
          return { error: "not_found" as const, id };
        }

        const targetIds = [...targetCardIds];
        for (const targetId of targetIds) {
          const targetR = await client.query("SELECT id, status FROM facility_cards WHERE id = $1", [targetId]);
          if (!targetR.rows[0]) {
            await client.query("ROLLBACK");
            return { error: "target_not_found" as const, id: targetId };
          }
        }

        for (const targetId of targetIds) {
          await client.query(
            `UPDATE reports SET facility_card_id = $1, updated_at = NOW() WHERE facility_card_id = $2`,
            [id, targetId]
          );
          await client.query(
            `DELETE FROM facility_cards WHERE id = $1`,
            [targetId]
          );
        }

        await client.query("COMMIT");
        return { merged: true, surviving_card_id: id, merged_card_ids: targetIds };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    });

    if (result && "error" in result) {
      if (result.error === "not_found") {
        return c.json({ error: { code: "NOT_FOUND", message: "Source facility card not found" } }, 404);
      }
      if (result.error === "target_not_found") {
        return c.json({ error: { code: "NOT_FOUND", message: `Target facility card ${result.id} not found` } }, 404);
      }
    }

    await appendAudit(c.env, {
      actor: user.sub,
      action: "facility_card_merge",
      objectType: "facility_card",
      objectId: id,
      after: result,
    }).catch((e) => logger.error({ route: c.req.path, method: c.req.method, error: e, context: "audit_write_failed" }));

    return c.json({ status: "merged", surviving_card_id: result.surviving_card_id, merged_card_ids: result.merged_card_ids });
  }),
);
