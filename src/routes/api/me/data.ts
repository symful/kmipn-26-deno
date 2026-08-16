import { Hono } from "hono";
import { withClient } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { appendAudit } from "@/lib/audit";
import type { Env } from "@/types/bindings";

export const meDataRoute = new Hono<{ Bindings: Env }>();

meDataRoute.get("/", requireAuth, safeHandler(async (c) => {
  const user = c.get("user");

  const result = await withClient(c.env, async (client) => {
    // Get user info
    const userR = await client.query<{ id: string; name: string; role: string }>(
      "SELECT id, name, role FROM users WHERE id = $1",
      [user.sub]
    );
    if (!userR.rows[0]) {
      return null;
    }

    // Get default wilayah (user's own wilayah)
    let defaultWilayah: { id: string; name: string; level: string } | null = null;
    if (user.wilayah_id) {
      const wilayahR = await client.query<{ id: string; name: string; level: string }>(
        "SELECT id, name, level FROM wilayah WHERE id = $1",
        [user.wilayah_id]
      );
      if (wilayahR.rows[0]) {
        defaultWilayah = wilayahR.rows[0];
      }
    }

    // Get accessible wilayahs (user's own + children via hierarchy)
    let accessibleWilayahs: { id: string; name: string; level: string }[] = [];
    if (user.wilayah_id) {
      const accessibleR = await client.query<{ id: string; name: string; level: string }>(
        `SELECT id, name, level FROM wilayah
         WHERE id = $1 OR parent_id = $1
         ORDER BY level ASC`,
        [user.wilayah_id]
      );
      accessibleWilayahs = accessibleR.rows;
    }

    return {
      user: {
        id: userR.rows[0].id,
        name: userR.rows[0].name,
        role: userR.rows[0].role,
      },
      default_wilayah: defaultWilayah,
      accessible_wilayah: accessibleWilayahs,
    };
  });

  if (!result) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  }

  return c.json(result);
}));

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
