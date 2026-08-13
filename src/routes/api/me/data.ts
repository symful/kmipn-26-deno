import { Hono } from "hono";
import { withClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import type { Env } from "@/types/bindings";

export const meDataRoute = new Hono<{ Bindings: Env }>();

meDataRoute.delete("/", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");
  await withClient(c.env, async (client) => {
    await client.query("UPDATE reports SET reporter_id = NULL WHERE reporter_id = $1", [user.sub]);
    await client.query("DELETE FROM consent_records WHERE user_id = $1", [user.sub]);
    await client.query("UPDATE audit_log SET actor = NULL WHERE actor = $1", [user.sub]);
  });
  await appendAudit(c.env, { actor: user.sub, action: "right_to_delete", objectType: "user", objectId: user.sub });
  return c.json({ status: "deleted" });
}));
