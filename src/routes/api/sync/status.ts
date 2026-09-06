import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseJson } from "@/lib/validation";

const schema = z
  .object({
    device_id: z.string().min(1).max(128),
    total_count: z.number().int().min(0).max(1000000),
    pending_count: z.number().int().min(0),
    failed_count: z.number().int().min(0),
  })
  .refine(
    (v) =>
      v.failed_count <= v.pending_count && v.pending_count <= v.total_count,
    "Queue counts must satisfy failed <= pending <= total",
  );

export const syncStatusRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
syncStatusRoute.post(
  "/",
  safeHandler(async (c) => {
    const data = await parseJson(c, schema);
    const observedAt = new Date().toISOString();
    await c.env.D1.prepare(
      `INSERT INTO device_sync_status
    (user_id, device_id, total_count, pending_count, failed_count, observed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id) DO UPDATE SET total_count=excluded.total_count,
    pending_count=excluded.pending_count, failed_count=excluded.failed_count, observed_at=excluded.observed_at`,
    )
      .bind(
        c.get("user").sub,
        data.device_id,
        data.total_count,
        data.pending_count,
        data.failed_count,
        observedAt,
      )
      .run();
    return c.json({ ...data, observed_at: observedAt });
  }),
);
