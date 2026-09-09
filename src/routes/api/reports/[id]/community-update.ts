import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { TERMINAL_STATES } from "@/types/case-states";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { rateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";
import { appendAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import { evaluatePriority } from "@/lib/priority/calculator";
import { generateId, ID_REGEX } from "@/lib/id";
import { z } from "zod";
import {
  runAssessment,
  classifyContribution,
  computeReviewRisk,
} from "@/lib/agent/orchestrator";
import { awardXp, recordAdjudication } from "@/lib/gamification";

const CommunityUpdateSchema = z.object({
  description: z.string().min(10, "Deskripsi pembaruan minimal 10 karakter"),
  photo_urls: z.array(z.string().url()).max(5).optional(),
});

const communityUpdateRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

communityUpdateRoute.post(
  "/",
  rateLimit({
    limit: 10,
    windowMs: 60_000,
    keyBy: (c) => c.req.header("Authorization") ?? "anon",
  }),
  safeHandler(async (c) => {
    const user = c.get("user");
    const reportId = c.req.param("id");

    if (!reportId || !ID_REGEX.test(reportId)) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "ID laporan tidak valid" } },
        400,
      );
    }

    const body = await c.req.json();
    const parsed = CommunityUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
        },
        400,
      );
    }

    const target = await c.env.D1.prepare(
      `SELECT id, status, reporter_id, category_id, lat, lng, kecamatan, kelurahan, kabupaten, provinsi, title
       FROM reports WHERE id = ?`,
    )
      .bind(reportId)
      .first<{
        id: string;
        status: string;
        reporter_id: string;
        category_id: string;
        lat: number;
        lng: number;
        kecamatan: string | null;
        kelurahan: string | null;
        kabupaten: string | null;
        provinsi: string | null;
        title: string | null;
      }>();

    if (!target) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Laporan tidak ditemukan" } },
        404,
      );
    }

    if (
      TERMINAL_STATES.includes(
        target.status as (typeof TERMINAL_STATES)[number],
      )
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_STATE",
            message: "Laporan dalam status terminal tidak dapat menerima pembaruan",
          },
        },
        409,
      );
    }

    const idempotencyKey = c.req.header("Idempotency-Key");
    if (idempotencyKey) {
      const existing = await c.env.D1.prepare(
        `SELECT id FROM reports WHERE idempotency_key = ?`,
      )
        .bind(idempotencyKey)
        .first<{ id: string }>();
      if (existing) {
        return c.json({ success: true, contribution_id: existing.id, cached: true });
      }
    }

    const contributionId = generateId();

    const batchStatements = [
      c.env.D1.prepare(
        `INSERT INTO reports (id, status, category_id, reporter_id, description, photo_urls, lat, lng, kecamatan, kelurahan, kabupaten, provinsi, submission_intent, related_case_id, reported_at, updated_at, title, idempotency_key)
         VALUES (?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'community_update', ?, datetime('now'), datetime('now'), ?, ?)`,
      ).bind(
        contributionId,
        target.category_id,
        user.sub,
        parsed.data.description,
        JSON.stringify(parsed.data.photo_urls ?? []),
        target.lat,
        target.lng,
        target.kecamatan,
        target.kelurahan,
        target.kabupaten,
        target.provinsi,
        reportId,
        target.title,
        idempotencyKey ?? null,
      ),
      c.env.D1.prepare(
        `INSERT INTO case_events (id, report_id, event_type, actor_id, occurred_at, metadata)
         VALUES (?, ?, 'community_update_submitted', ?, datetime('now'), ?)`,
      ).bind(
        generateId(),
        contributionId,
        user.sub,
        JSON.stringify({ target_case_id: reportId, description: parsed.data.description }),
      ),
    ];

    await c.env.D1.batch(batchStatements);

    let assessment;
    try {
      assessment = await runAssessment(c.env, contributionId);
    } catch (e) {
      logger.error({
        route: c.req.path,
        method: c.req.method,
        error: e instanceof Error ? e : new Error(String(e)),
        context: "assessment_failed",
      });
      assessment = null;
    }

    const toolResults = assessment?.tool_results ?? {};
    const isFailed = assessment?.overall_status === "failed";

    const extractDamage = toolResults.extract_damage_indicators as
      | { status: string; value?: { damage_visible?: boolean } }
      | undefined;
    const assessLocation = toolResults.assess_location_time_consistency as
      | { status: string; value?: { consistent?: boolean } }
      | undefined;
    const assessMedia = toolResults.assess_media_quality as
      | { status: string; value?: { quality_ok?: boolean } }
      | undefined;
    const detectPrivacy = toolResults.detect_privacy_risk as
      | { status: string; value?: { risk_level?: string; pii_detected?: boolean } }
      | undefined;

    const confidences: number[] = [];
    for (const [toolName, result] of Object.entries(toolResults)) {
      if (toolName === "collect_field_evidence") continue;
      const r = result as { status: string; value?: { confidence?: number } };
      if (r.status === "fulfilled" && typeof r.value?.confidence === "number") {
        confidences.push(r.value.confidence);
      }
    }
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    const gates = {
      photos: (parsed.data.photo_urls?.length ?? 0) > 0,
      no_damage:
        extractDamage?.status === "fulfilled" &&
        extractDamage?.value?.damage_visible === false,
      location_consistent:
        assessLocation?.status === "fulfilled" &&
        assessLocation?.value?.consistent === true,
      media_ok:
        assessMedia?.status === "fulfilled" &&
        assessMedia?.value?.quality_ok !== false,
      privacy_ok:
        detectPrivacy?.status === "fulfilled" &&
        detectPrivacy?.value?.risk_level !== "high" &&
        detectPrivacy?.value?.pii_detected !== true,
      classified_status_change:
        !isFailed && classifyContribution(toolResults as Parameters<typeof classifyContribution>[0]) === "status_changing_update",
      confidence_ok: avgConfidence >= 0.6,
    };

    const allPass = Object.values(gates).every(Boolean);

    if (allPass) {
      const batchResolve = [
        c.env.D1.prepare(
          `UPDATE reports SET status = 'resolved', resolved_at = datetime('now'), resolution_source = 'community', verification_method = 'auto_rule', updated_at = datetime('now') WHERE id = ?`,
        ).bind(reportId),
        c.env.D1.prepare(
          `UPDATE reports SET status = 'closed', contribution_type = 'status_changing_update', updated_at = datetime('now') WHERE id = ?`,
        ).bind(contributionId),
        c.env.D1.prepare(
          `INSERT INTO case_events (id, report_id, event_type, actor_id, occurred_at, metadata)
           VALUES (?, ?, 'community_auto_resolved', ?, datetime('now'), ?)`,
        ).bind(
          generateId(),
          reportId,
          user.sub,
          JSON.stringify({
            contribution_id: contributionId,
            reason: parsed.data.description,
            gates,
            review_risk: computeReviewRisk(toolResults as Parameters<typeof computeReviewRisk>[0]),
          }),
        ),
      ];

      await c.env.D1.batch(batchResolve);

      c.executionCtx.waitUntil(
        Promise.all([
          appendAudit(c.env, {
            actor: user.sub,
            action: "community_auto_resolved",
            objectType: "report",
            objectId: reportId,
            before: { status: target.status },
            after: { status: "resolved", contribution_id: contributionId },
          }),
          recordAdjudication(c.env, user.sub, contributionId, true),
          awardXp(c.env, {
            userId: user.sub,
            contributionId,
            type:
              user.sub === target.reporter_id
                ? "self_status_changing_update"
                : "status_changing_update",
            idempotencyKey: `community_update:${contributionId}`,
            reason: "Community evidence auto-resolved",
          }),
          sendNotification(
            c.env,
            target.reporter_id,
            "report_resolved",
            "Bukti komunitas telah menyelesaikan kasus ini.",
            reportId,
            c.req.path,
            c.req.method,
            "Kasus Diselesaikan",
          ),
          sendNotification(
            c.env,
            user.sub,
            "report_resolved",
            "Kontribusi Anda diterima. XP telah diberikan.",
            contributionId,
            c.req.path,
            c.req.method,
            "Kontribusi Diterima",
          ),
          evaluatePriority(c.env, reportId),
        ]).catch((e) =>
          logger.error({
            route: c.req.path,
            method: c.req.method,
            error: e instanceof Error ? e : new Error(String(e)),
            context: "post_resolve_hooks_failed",
          }),
        ),
      );

      return c.json({
        success: true,
        contribution_id: contributionId,
        resolution: "auto_resolved",
        gates,
      });
    }

    const classifiedType = classifyContribution(toolResults as Parameters<typeof classifyContribution>[0]);
    await c.env.D1.prepare(
      `UPDATE reports SET contribution_type = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(classifiedType, contributionId)
      .run();

    await c.env.D1.prepare(
      `INSERT INTO case_events (id, report_id, event_type, actor_id, occurred_at, metadata)
       VALUES (?, ?, 'community_update_needs_review', ?, datetime('now'), ?)`,
    )
      .bind(
        generateId(),
        reportId,
        user.sub,
        JSON.stringify({ contribution_id: contributionId, gates }),
      )
      .run();

    c.executionCtx.waitUntil(
      Promise.all([
        appendAudit(c.env, {
          actor: user.sub,
          action: "community_update_needs_review",
          objectType: "report",
          objectId: reportId,
          after: { contribution_id: contributionId, gates },
        }),
        (async () => {
          const admins = await c.env.D1.prepare(
            `SELECT id FROM users WHERE role = 'ADMIN' AND disabled = 0 AND deleted_at IS NULL LIMIT 5`,
          )
            .all<{ id: string }>();
          for (const admin of admins.results ?? []) {
            await sendNotification(
              c.env,
              admin.id,
              "admin_alert",
              "Pembaruan kondisi dari warga memerlukan review manusia.",
              contributionId,
              c.req.path,
              c.req.method,
              "Pembaruan Kondisi Perlu Review",
            );
          }
        })(),
        sendNotification(
          c.env,
          user.sub,
          "status_change",
          "Pembaruan Anda telah dikirim dan menunggu verifikasi manusia.",
          contributionId,
          c.req.path,
          c.req.method,
          "Pembaruan Terkirim",
        ),
        evaluatePriority(c.env, reportId),
      ]).catch((e) =>
        logger.error({
          route: c.req.path,
          method: c.req.method,
          error: e instanceof Error ? e : new Error(String(e)),
          context: "post_needs_review_hooks_failed",
        }),
      ),
    );

    return c.json({
      success: true,
      contribution_id: contributionId,
      resolution: "needs_review",
      gates,
    });
  }),
);

export { communityUpdateRoute };
