import { Hono } from "hono";
import { z } from "zod";
import { pushConfigured, validPushEndpoint } from "@/lib/push";
import { sendNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/ratelimit";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

const notificationsRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

notificationsRoutes.get(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const unreadOnly = c.req.query("unread") === "1";

    let sql =
      "SELECT COALESCE(id, CAST(rowid AS TEXT)) as id, user_id, kind, title, body, related_case_id, related_report_id, read_at, created_at FROM notifications WHERE user_id = ?";
    const params: string[] = [user.sub];

    if (unreadOnly) {
      sql += " AND read_at IS NULL";
    }

    sql +=
      " ORDER BY read_at IS NULL DESC, julianday(created_at) DESC, rowid DESC";

    const rows = await c.env.D1.prepare(sql)
      .bind(...params)
      .all<{
        id: string;
        user_id: string;
        kind: string;
        title: string;
        body: string;
        related_case_id: string | null;
        related_report_id: string | null;
        read_at: string | null;
        created_at: string;
      }>();

    const notifications = (rows.results ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      type: row.kind,
      title: row.title,
      body: row.body,
      related_case_id: row.related_case_id,
      related_report_id: row.related_report_id,
      read_at: row.read_at,
      created_at: row.created_at,
    }));

    return c.json({ data: notifications });
  }),
);

export { notificationsRoutes };
notificationsRoutes.post(
  "/test",
  rateLimit({
    limit: 3,
    windowMs: 60000,
    keyBy: (c) => c.req.header("Authorization") ?? "anonymous",
  }),
  safeHandler(async (c) => {
    const subscription = await c.env.D1.prepare(
      "SELECT id FROM push_subscriptions WHERE user_id=? LIMIT 1",
    )
      .bind(c.get("user").sub)
      .first();
    if (!subscription)
      return c.json(
        {
          error: {
            code: "NOT_SUBSCRIBED",
            message: "Enable device notifications first",
          },
        },
        409,
      );
    await sendNotification(
      c.env,
      c.get("user").sub,
      "system",
      "Notifikasi percobaan untuk perangkat Anda.",
      undefined,
      c.req.path,
      c.req.method,
      "Tes Notifikasi",
    );
    return c.json({ queued: true }, 202);
  }),
);

notificationsRoutes.get(
  "/push-config",
  safeHandler(async (c) => c.json(pushConfigured(c.env))),
);
const WebSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine(validPushEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
notificationsRoutes.post(
  "/subscriptions",
  safeHandler(async (c) => {
    if (!pushConfigured(c.env).web_push.configured)
      return c.json(
        {
          error: {
            code: "NOT_CONFIGURED",
            message: "Web push is not configured",
          },
        },
        503,
      );
    const parsed = WebSubscriptionSchema.safeParse(await c.req.json());
    if (!parsed.success)
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid push subscription",
          },
        },
        400,
      );
    const id = crypto.randomUUID();
    await c.env.D1.prepare(
      `INSERT INTO push_subscriptions(id,user_id,transport,endpoint,keys_json) VALUES(?,?,'web',?,?) ON CONFLICT(user_id,endpoint) DO UPDATE SET keys_json=excluded.keys_json`,
    )
      .bind(
        id,
        c.get("user").sub,
        parsed.data.endpoint,
        JSON.stringify(parsed.data.keys),
      )
      .run();
    const row = await c.env.D1.prepare(
      "SELECT id FROM push_subscriptions WHERE user_id=? AND endpoint=?",
    )
      .bind(c.get("user").sub, parsed.data.endpoint)
      .first<{ id: string }>();
    return c.json({ id: row!.id }, 201);
  }),
);
notificationsRoutes.delete(
  "/subscriptions",
  safeHandler(async (c) => {
    const parsed = z
      .object({ endpoint: z.string().max(2048) })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid endpoint" }, 400);
    await c.env.D1.prepare(
      "DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?",
    )
      .bind(c.get("user").sub, parsed.data.endpoint)
      .run();
    return c.json({ ok: true });
  }),
);
notificationsRoutes.post(
  "/devices",
  safeHandler(async (c) => {
    if (!pushConfigured(c.env).fcm.configured)
      return c.json(
        {
          error: {
            code: "NOT_CONFIGURED",
            message: "Android push is not configured",
          },
        },
        503,
      );
    const parsed = z
      .object({
        device_id: z.string().min(1).max(128),
        token: z.string().min(20).max(4096),
        platform: z.literal("android"),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid device" }, 400);
    // A device token belongs only to its current signed-in account.
    await c.env.D1.prepare(
      "DELETE FROM push_subscriptions WHERE transport='fcm' AND token=? AND user_id!=?",
    )
      .bind(parsed.data.token, c.get("user").sub)
      .run();
    const id = crypto.randomUUID();
    await c.env.D1.prepare(
      `INSERT INTO push_subscriptions(id,user_id,transport,device_id,token) VALUES(?,?,'fcm',?,?) ON CONFLICT(user_id,device_id) DO UPDATE SET token=excluded.token`,
    )
      .bind(id, c.get("user").sub, parsed.data.device_id, parsed.data.token)
      .run();
    return c.json({ id: parsed.data.device_id }, 201);
  }),
);
notificationsRoutes.delete(
  "/devices",
  safeHandler(async (c) => {
    const parsed = z
      .object({ device_id: z.string().min(1).max(128) })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: "Invalid device" }, 400);
    await c.env.D1.prepare(
      "DELETE FROM push_subscriptions WHERE user_id=? AND device_id=?",
    )
      .bind(c.get("user").sub, parsed.data.device_id)
      .run();
    return c.json({ ok: true });
  }),
);
