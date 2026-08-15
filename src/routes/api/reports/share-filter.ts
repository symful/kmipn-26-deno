import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { getConfig } from "@/config/env";

export const shareFilterRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

shareFilterRoute.post(
  requireAuth,
  safeHandler(async (c) => {
    const body = await c.req.json();

    if (!body.filter || typeof body.filter !== "object") {
      return c.json(
        { error: { code: "BAD_REQUEST", message: "Parameter filter diperlukan" } },
        400
      );
    }

    const config = getConfig(c.env as unknown as Record<string, string | undefined>);
    const shareToken = crypto.randomUUID();

    let expiresAt: Date;
    if (body.expires_at) {
      expiresAt = new Date(body.expires_at);
      if (isNaN(expiresAt.getTime())) {
        return c.json(
          { error: { code: "BAD_REQUEST", message: "Format expires_at tidak valid" } },
          400
        );
      }
    } else {
      const defaultExpiryHours = config.SHARE_TOKEN_EXPIRY_HOURS ?? 168;
      expiresAt = new Date(Date.now() + defaultExpiryHours * 60 * 60 * 1000);
    }

    await withClient(c.env, async (client) => {
      await client.query(
        `INSERT INTO shared_filters (filter_data, share_token, expires_at)
         VALUES ($1, $2, $3)`,
        [JSON.stringify(body.filter), shareToken, expiresAt]
      );
    });

    const baseUrl = config.APP_BASE_URL ?? c.env.APP_BASE_URL;
    if (!baseUrl) {
      throw new Error("APP_BASE_URL is not configured");
    }
    const shareUrl = `${baseUrl}/shared/${shareToken}`;

    return c.json({
      url: shareUrl,
      expires_at: expiresAt.toISOString(),
    });
  }),
);
