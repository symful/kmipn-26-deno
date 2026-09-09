import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import {
  AgentApproveSchema,
  AgentMergeSchema,
  AgentRejectSchema,
  AgentRequestPhotoSchema,
} from "@/lib/schemas";
import { safeHandler } from "@/lib/safeHandler";
import { rateLimit } from "@/lib/ratelimit";
import { requireRole } from "@/lib/rbac";
import { appendAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { recordAdjudication, awardXp } from "@/lib/gamification";

export const agentActionsRoute = new Hono<{ Bindings: Env }>();

agentActionsRoute.post(
  "/approve",
  requireRole("ADMIN"),
  rateLimit({
    limit: 20,
    windowMs: 60_000,
    keyBy: (c) => c.req.header("Authorization") ?? "anon",
  }),
  safeHandler(async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = AgentApproveSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const { report_id, reason } = parsed.data;

    const report = await c.env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?",
    )
      .bind(report_id)
      .first<{ id: string; status: string }>();
    if (!report) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }

    const terminal = ["rejected", "duplicate_merged", "closed"];
    if (terminal.includes(report.status)) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot approve a report in '${report.status}' state`,
          },
        },
        409,
      );
    }

    await c.env.D1.prepare(
      "UPDATE reports SET status = 'verified', verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    )
      .bind(report_id)
      .run();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: user.role,
        actor: user.sub,
        action: "agent_approve",
        objectType: "report",
        objectId: report_id,
        before: { status: report.status },
        after: { status: "verified", reason },
        reason,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    {
      const rpt = await c.env.D1.prepare(
        `SELECT reporter_id FROM reports WHERE id = ?`,
      )
        .bind(report_id)
        .first<{ reporter_id: string }>();
      if (rpt?.reporter_id) {
        c.executionCtx.waitUntil(
          Promise.all([
            recordAdjudication(c.env, rpt.reporter_id, report_id, true),
            awardXp(c.env, {
              userId: rpt.reporter_id,
              contributionId: report_id,
              type: "new_report",
              idempotencyKey: `xp:${report_id}:new_report`,
              reason: "Report approved via agent",
            }),
          ]).catch((e) =>
            logger.error({
              route: c.req.path,
              method: c.req.method,
              error: e instanceof Error ? e : new Error(String(e)),
              context: "gamification_hook_failed",
            }),
          ),
        );
      }
    }

    return c.json({ report_id, status: "verified", reason });
  }),
);

agentActionsRoute.post(
  "/merge",
  requireRole("ADMIN"),
  rateLimit({
    limit: 20,
    windowMs: 60_000,
    keyBy: (c) => c.req.header("Authorization") ?? "anon",
  }),
  safeHandler(async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = AgentMergeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const { target_report_id, source_report_id, reason } = parsed.data;

    if (target_report_id === source_report_id) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "target and source report must be different",
          },
        },
        400,
      );
    }

    const target = await c.env.D1.prepare(
      "SELECT id, status, facility_card_id FROM reports WHERE id = ?",
    )
      .bind(target_report_id)
      .first<{ id: string; status: string; facility_card_id: string | null }>();
    if (!target) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Target report not found" } },
        404,
      );
    }

    const source = await c.env.D1.prepare(
      "SELECT id, status, facility_card_id FROM reports WHERE id = ?",
    )
      .bind(source_report_id)
      .first<{ id: string; status: string; facility_card_id: string | null }>();
    if (!source) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Source report not found" } },
        404,
      );
    }

    const terminal = ["rejected", "duplicate_merged", "closed"];
    if (terminal.includes(target.status)) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot merge into a target in '${target.status}' state`,
          },
        },
        409,
      );
    }

    const effectiveFacilityCardId =
      target.facility_card_id ?? source.facility_card_id;

    const statements = [
      c.env.D1.prepare(
        "UPDATE reports SET status = 'duplicate_merged', merged_into = ?, updated_at = datetime('now') WHERE id = ?",
      ).bind(target_report_id, source_report_id),
      c.env.D1.prepare(
        "UPDATE reports SET facility_card_id = ?, updated_at = datetime('now') WHERE id = ?",
      ).bind(effectiveFacilityCardId, target_report_id),
    ];

    await c.env.D1.batch(statements);

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: user.role,
        actor: user.sub,
        action: "agent_merge",
        objectType: "report",
        objectId: source_report_id,
        before: {
          status: source.status,
          facility_card_id: source.facility_card_id,
        },
        after: {
          status: "duplicate_merged",
          merged_into: target_report_id,
          facility_card_id: effectiveFacilityCardId,
          reason,
        },
        reason,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    {
      const rpt = await c.env.D1.prepare(
        `SELECT reporter_id FROM reports WHERE id = ?`,
      )
        .bind(source_report_id)
        .first<{ reporter_id: string }>();
      if (rpt?.reporter_id) {
        c.executionCtx.waitUntil(
          recordAdjudication(c.env, rpt.reporter_id, source_report_id, false).catch((e) =>
            logger.error({
              route: c.req.path,
              method: c.req.method,
              error: e instanceof Error ? e : new Error(String(e)),
              context: "gamification_hook_failed",
            }),
          ),
        );
      }
    }

    return c.json({
      source_report_id,
      target_report_id,
      status: "duplicate_merged",
      reason,
    });
  }),
);

agentActionsRoute.post(
  "/reject",
  requireRole("ADMIN"),
  rateLimit({
    limit: 20,
    windowMs: 60_000,
    keyBy: (c) => c.req.header("Authorization") ?? "anon",
  }),
  safeHandler(async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = AgentRejectSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const { report_id, reason } = parsed.data;

    const report = await c.env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?",
    )
      .bind(report_id)
      .first<{ id: string; status: string }>();
    if (!report) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }

    const terminal = ["rejected", "duplicate_merged", "closed"];
    if (terminal.includes(report.status)) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot reject a report in '${report.status}' state`,
          },
        },
        409,
      );
    }

    await c.env.D1.prepare(
      "UPDATE reports SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(reason, report_id)
      .run();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: user.role,
        actor: user.sub,
        action: "agent_reject",
        objectType: "report",
        objectId: report_id,
        before: { status: report.status },
        after: { status: "rejected", reason },
        reason,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    {
      const rpt = await c.env.D1.prepare(
        `SELECT reporter_id FROM reports WHERE id = ?`,
      )
        .bind(report_id)
        .first<{ reporter_id: string }>();
      if (rpt?.reporter_id) {
        c.executionCtx.waitUntil(
          recordAdjudication(c.env, rpt.reporter_id, report_id, false).catch((e) =>
            logger.error({
              route: c.req.path,
              method: c.req.method,
              error: e instanceof Error ? e : new Error(String(e)),
              context: "gamification_hook_failed",
            }),
          ),
        );
      }
    }

    return c.json({ report_id, status: "rejected", reason });
  }),
);

agentActionsRoute.post(
  "/request-photo",
  requireRole("ADMIN"),
  rateLimit({
    limit: 20,
    windowMs: 60_000,
    keyBy: (c) => c.req.header("Authorization") ?? "anon",
  }),
  safeHandler(async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = AgentRequestPhotoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid request data" },
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const { report_id, reason } = parsed.data;

    const report = await c.env.D1.prepare(
      "SELECT id, status FROM reports WHERE id = ?",
    )
      .bind(report_id)
      .first<{ id: string; status: string }>();
    if (!report) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Report not found" } },
        404,
      );
    }

    const terminal = ["rejected", "duplicate_merged", "closed"];
    if (terminal.includes(report.status)) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot request photo for a report in '${report.status}' state`,
          },
        },
        409,
      );
    }

    await c.env.D1.prepare(
      "UPDATE reports SET status = 'needs_completion', updated_at = datetime('now') WHERE id = ?",
    )
      .bind(report_id)
      .run();

    c.executionCtx.waitUntil(
      appendAudit(c.env, {
        activeRole: user.role,
        actor: user.sub,
        action: "agent_request_photo",
        objectType: "report",
        objectId: report_id,
        before: { status: report.status },
        after: { status: "needs_completion", reason },
        reason,
      }).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e,
          context: "audit_write_failed",
        }),
      ),
    );

    return c.json({ report_id, status: "needs_completion", reason });
  }),
);
