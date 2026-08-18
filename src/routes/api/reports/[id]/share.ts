import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getConfig } from "@/config/env";


export const shareRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

shareRoute.get(
  "/",
  requireAuth,
  safeHandler(async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const result = await withClient(c.env, async (client) => {
      const share = await client.query(
        `SELECT rs.report_id, rs.share_token, rs.expires_at, rs.created_by, r.reporter_id
         FROM report_shares rs
         JOIN reports r ON r.id = rs.report_id
         WHERE rs.report_id = $1`,
        [id]
      );
      if (!share.rows[0]) return null;
      return share.rows[0];
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Share token tidak ditemukan" } }, 404);
    }

    const elevatedRoles = ["ADMIN", "VERIFIKATOR", "OPERATOR"];
    if (!elevatedRoles.includes(user.role) && result.reporter_id !== user.sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "Tidak memiliki akses ke share ini" } }, 403);
    }

    const baseUrl = c.env.APP_BASE_URL;
    if (!baseUrl) {
      throw new Error("APP_BASE_URL is not configured");
    }
    const shareUrl = `${baseUrl}/public/report/${result.share_token}`;

    return c.json({
      share_url: shareUrl,
      expires_at: result.expires_at.toISOString(),
    });
  }),
);

shareRoute.post(
  "/",
  requireAuth,
  requireRole("VERIFIKATOR", "ADMIN", "OPERATOR"),
  safeHandler(async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const config = getConfig(c.env as unknown as Record<string, string | undefined>);
    const SHARE_TOKEN_EXPIRY_HOURS = config.SHARE_TOKEN_EXPIRY_HOURS;

    const result = await withClient(c.env, async (client) => {
      const reportCheck = await client.query("SELECT id FROM reports WHERE id = $1", [id]);
      if (!reportCheck.rows[0]) return null;

      const shareToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + SHARE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO report_shares (report_id, share_token, expires_at, created_by)
         VALUES ($1, $2, $3, $4)`,
        [id, shareToken, expiresAt, user.sub]
      );

      return { shareToken, expiresAt };
    });

    if (!result) {
      return c.json({ error: { code: "NOT_FOUND", message: "Report tidak ditemukan" } }, 404);
    }

    const baseUrl = c.env.APP_BASE_URL;
    if (!baseUrl) {
      throw new Error("APP_BASE_URL is not configured");
    }
    const shareUrl = `${baseUrl}/public/report/${result.shareToken}`;

    logger.info({ route: c.req.path, method: c.req.method, reportId: id, actorId: user.sub });

    return c.json({
      share_url: shareUrl,
      expires_at: result.expiresAt.toISOString(),
    });
  }),
);
