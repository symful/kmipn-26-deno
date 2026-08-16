import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const surveyorTaskStartRoute = new Hono<{ Bindings: Env }>();

surveyorTaskStartRoute.post("/", requireAuth, requireRole("SURVEYOR"), safeHandler(async (c) => {
  const taskId = c.req.param("id");
  const user = c.get("user");

  const result = await withClient(c.env, async (client) => {
    const r = await client.query(
      `UPDATE surveyor_tasks 
       SET started_at = NOW()
       WHERE id = $1 AND surveyor_id = $2 AND status = 'assigned' AND started_at IS NULL
       RETURNING id, status, started_at`,
      [taskId, user.sub]
    );
    return r.rows[0];
  });

  if (!result) {
    return c.json({ error: { code: "NOT_FOUND", message: "Task not found or already started" } }, 404);
  }

  return c.json({ status: result.status, started_at: result.started_at });
}));
