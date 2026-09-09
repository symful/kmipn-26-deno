import { photoMetadataMigrationRoute } from "@/routes/api/admin/photo-metadata-migration";
import { geocodeRoute } from "./routes/api/geocode";
import { syncStatusRoute } from "@/routes/api/sync/status";
import { Hono } from "hono";
import { flushPendingPush } from "@/lib/push";
import { integrationsRoute } from "@/routes/api/admin/integrations";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logger } from "./lib/logger";
import { cspMiddleware } from "@/middleware/csp";
import { healthRoute } from "@/routes/api/health";
import { clientErrorsRoute } from "@/routes/api/client-errors";
import { categoriesRoute } from "@/routes/api/categories";
import { configRoute } from "@/routes/api/config/index";
import { authLoginRoute } from "@/routes/api/auth/login";
import { authRefreshRoute } from "@/routes/api/auth/refresh";
import { authLogoutRoute } from "@/routes/api/auth/logout";
import { authMeRoute } from "@/routes/api/auth/me";
import { registerWargaRoute } from "@/routes/api/auth/register";
import { reportsIndexRoute } from "@/routes/api/reports/index";
import { reportsStatsRoute } from "@/routes/api/reports/stats";
import { reportsHeatmapRoute } from "@/routes/api/reports/heatmap";
import { reportsNearbyRoute } from "@/routes/api/reports/nearby";
import { reportByIdRoute } from "@/routes/api/reports/[id]";
import { priorityRoute } from "@/routes/api/reports/[id]/priority";
import { photosUploadUrlRoute } from "@/routes/api/reports/photos/upload-url";
import { closeRoute } from "@/routes/api/reports/[id]/close";
import { escalateRoute } from "@/routes/api/reports/[id]/escalate";
import { assignRoute } from "@/routes/api/reports/[id]/assign";
import { mergeRoute } from "@/routes/api/reports/[id]/merge";
import { sanggahanRoute } from "@/routes/api/reports/[id]/sanggahan";
import { reopenRoute } from "@/routes/api/reports/[id]/reopen";
import { selfCloseRoute } from "@/routes/api/reports/[id]/self-close";
import { evidenceRoute } from "@/routes/api/reports/[id]/evidence";
import { photosPresignedRoute } from "@/routes/api/reports/[id]/photos-presigned";
import { reportTimelineHandler } from "@/routes/api/reports/[id]/timeline";
import { reportsDuplicatesRoute } from "@/routes/api/reports/duplicates";
import { reportDuplicatesByIdRoute } from "@/routes/api/reports/[id]/duplicates";
import { exportGeojsonRoute } from "@/routes/api/export/geojson";
import { exportCsvRoute } from "@/routes/api/export/csv";
import { exportPdfRoute } from "@/routes/api/export/pdf";
import { publicGeojsonRoute } from "@/routes/api/public/geojson";
import { publicReportsRoute } from "@/routes/api/public/reports";
import { publicReportsClusterRoute } from "@/routes/api/public/reports/cluster";
import { publicCasesRoutes } from "@/routes/api/public/cases";
import { publicCasesRoute } from "@/routes/api/public/cases/[id]";
import { publicCategoriesRoute } from "@/routes/api/public/categories";
import { publicStatsRoute } from "@/routes/api/public/stats";
import { publicStatsTrendRoute } from "@/routes/api/public/stats-trend";
import { anonymousReportsRoute } from "@/routes/api/public/anonymous-reports";
import { agentAssessRoute } from "@/routes/api/agent/assess";
import { agentAssessmentsRoute } from "@/routes/api/agent/assessments";
import { agentActionsRoute } from "@/routes/api/agent/actions";
import { gamificationRoute } from "@/routes/api/gamification/index";
import { gamificationLeaderboardRoutes } from "@/routes/api/gamification/leaderboard";
import { communityUpdateRoute } from "@/routes/api/reports/[id]/community-update";

import {
  processFailedAssessments,
  cleanupRevokedTokens,
  cleanupAuditLog,
} from "@/lib/cron-functions";
import { notificationsRoutes } from "@/routes/api/notifications";
import { markReadRoute } from "@/routes/api/notifications/mark-read";
import { adminFailedAssessmentsRoute } from "@/routes/api/admin/failed-assessments";

import { retryBatchRoute } from "@/routes/api/admin/failed-assessments/retry-batch";
import { regionalDashboardRoute } from "@/routes/api/regional/dashboard";
import { regionalCasesRoute } from "@/routes/api/regional/cases";
import { regionalOperatorsRoute } from "@/routes/api/regional/operators";
import { regionalPetugasRoute } from "@/routes/api/regional/petugas";
import { regionalSlaRoute } from "@/routes/api/regional/sla/index";
import { regionalSlaDetailRoute } from "@/routes/api/regional/sla/[id]";
import { regionalUnitsRoute } from "@/routes/api/regional/units";

import { auditSearchRoute } from "@/routes/api/audit/audit-search";
import { auditExportRoute } from "@/routes/api/audit/audit-export";
import { auditStatsRoute } from "@/routes/api/audit/stats";
import { auditVerifyChainRoute } from "@/routes/api/audit/verify-chain";
import { analyticsDashboardRoute } from "@/routes/api/analytics/dashboard";
import { analyticsRegionalStatsRoute } from "@/routes/api/analytics/regional-stats";
import { analyticsTrendRoute } from "@/routes/api/analytics/trend-analysis";

import { syncBatchRoute } from "@/routes/api/sync/batch";
import { facilitiesIndexRoute } from "@/routes/api/facilities/index";
import { facilitiesClusterRoute } from "@/routes/api/facilities/cluster";
import { anonymousPhotosUploadUrlRoute } from "@/routes/api/reports/photos/upload-url-anon";
import { adminUsersRoute } from "@/routes/api/admin/users";
import { adminCategoryRoutes } from "@/routes/api/admin/categories/[id]";
import { casesQueueRoute } from "@/routes/api/cases/queue";
import { caseDetailRoute } from "@/routes/api/cases/[id]";
import { casesAcceptRoute } from "@/routes/api/cases/[id]/accept";
import { casesDecideRoute } from "@/routes/api/cases/[id]/decide";
import { casesPriorityBreakdownRoute } from "@/routes/api/cases/[id]/priority-breakdown";
import { casesRejectRoute } from "@/routes/api/cases/[id]/reject";
import { casesCombineRoute } from "@/routes/api/cases/[id]/combine";
import { casesSeparateRoute } from "@/routes/api/cases/[id]/separate";
import { casesReviewSanggahanRoute } from "@/routes/api/cases/[id]/review-sanggahan";
import { casesVerifyCompletionRoute } from "@/routes/api/cases/[id]/verify-completion";
import { casesOverridePriorityRoute } from "@/routes/api/cases/[id]/override-priority";
import { tasksRoute } from "@/routes/api/tasks/tasks";
import { taskDetailRoute } from "@/routes/api/tasks/[id]/index";
import { taskAcceptRoute } from "@/routes/api/tasks/[id]/accept";
import { taskStartRoute } from "@/routes/api/tasks/[id]/start";
import { taskProgressRoute } from "@/routes/api/tasks/[id]/progress";
import { taskCompleteRoute } from "@/routes/api/tasks/[id]/complete";
import { taskRejectRoute } from "@/routes/api/tasks/[id]/reject";
import { taskClarificationRoute } from "@/routes/api/tasks/[id]/clarification";
import { taskEvidenceRoute } from "@/routes/api/tasks/[id]/evidence";
import { taskVisitRoute } from "@/routes/api/tasks/[id]/visit";
import { taskChecklistTemplateRoute } from "@/routes/api/tasks/[id]/checklist-template";
import { usersRoute } from "@/routes/api/users";
import { unitsRoute } from "@/routes/api/units";
import { priorityConfigRoute } from "@/routes/api/priority-config";
import { priorityConfigDetailRoute } from "@/routes/api/priority-config/[id]";
import { priorityConfigActivateRoute } from "@/routes/api/priority-config/[id]/activate";
import { statsRoute } from "@/routes/api/stats";
import { syncQualityRoute } from "@/routes/api/stats/sync-quality";
import { mapRoutes } from "@/routes/api/map";
import { exportRoutes } from "@/routes/api/export";
import { r2ProxyRoute } from "@/routes/r2";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// ── Global middleware ──────────────────────────────────────────────
app.use("*", cspMiddleware);
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Active-Role, X-Requested-With, Cache-Control",
  );
  const requestOrigin = c.req.header("Origin");
  if (requestOrigin) {
    c.header("Access-Control-Allow-Origin", requestOrigin);
    c.header("Access-Control-Allow-Credentials", "true");
  }
  if (c.req.method === "OPTIONS") return c.text("", 204);
  return await next();
});

// ── R2 proxy ──────────────────────────────────────────────────────
app.route("/r2", r2ProxyRoute);

// ═══════════════════════════════════════════════════════════════════
// PUBLIC — no auth required
// ═══════════════════════════════════════════════════════════════════
app.route("/api/health", healthRoute);
app.route("/api/client-errors", clientErrorsRoute);
app.route("/api/auth/login", authLoginRoute);
app.route("/api/auth/refresh", authRefreshRoute);
app.route("/api/auth/register", registerWargaRoute);
app.route("/api/public/geojson", publicGeojsonRoute);
app.route("/api/public/reports/cluster", publicReportsClusterRoute);
app.route("/api/public/reports", publicReportsRoute);
app.route("/api/public/cases", publicCasesRoutes);
app.route("/api/public/cases/:id", publicCasesRoute);
app.route("/api/public/categories", publicCategoriesRoute);
app.route("/api/public/stats", publicStatsRoute);
app.route("/api/public/stats/trend", publicStatsTrendRoute);
app.route("/api/public/anonymous-reports", anonymousReportsRoute);
app.route("/api/public/gamification/leaderboard", gamificationLeaderboardRoutes);
app.route("/api/reports/photos/upload-url-anon", anonymousPhotosUploadUrlRoute);

// ── Reverse geocoding (public) ────────────────────────────────────
app.route("/api/geocode", geocodeRoute);

// ═══════════════════════════════════════════════════════════════════
// requireAuth — authenticated users (any role)
// ═══════════════════════════════════════════════════════════════════
app.use("/api/reports", requireAuth);
app.use("/api/tasks", requireAuth);
app.use("/api/stats", requireAuth);
app.use("/api/notifications", requireAuth);
app.use("/api/sync/batch", requireAuth);
app.use("/api/sync/status", requireAuth);
app.use("/api/agent", requireAuth);
app.use("/api/units", requireAuth);
app.use("/api/categories", requireAuth);
app.use("/api/config", requireAuth);
app.use("/api/export", requireAuth);
app.use("/api/map", requireAuth);
app.use("/api/facilities", requireAuth);
app.use("/api/auth/me", requireAuth);
app.use("/api/auth/logout", requireAuth);
app.use("/api/gamification", requireAuth);
app.use("/api/gamification/*", requireAuth);

// Hono prefix middleware needs a wildcard for nested endpoints.
for (const prefix of [
  "reports",
  "tasks",
  "stats",
  "notifications",
  "agent",
  "units",
  "categories",
  "config",
  "export",
  "map",
  "facilities",
]) {
  app.use(`/api/${prefix}/*`, requireAuth);
}
app.use("/api/agent/*", requireRole("ADMIN"));
app.use("/api/reports/:id/assign", requireRole("ADMIN", "PETUGAS"));

// ── requireAuth route registrations ────────────────────────────────
app.route("/api/categories", categoriesRoute);
app.route("/api/auth/logout", authLogoutRoute);
app.route("/api/auth/me", authMeRoute);
app.route("/api/reports", reportsIndexRoute);
app.route("/api/reports/stats", reportsStatsRoute);
app.route("/api/reports/heatmap", reportsHeatmapRoute);
app.route("/api/reports/nearby", reportsNearbyRoute);
app.route("/api/reports/duplicates", reportsDuplicatesRoute);
app.get("/api/reports/:id/timeline", reportTimelineHandler);
app.route("/api/reports/:id", reportByIdRoute);
app.route("/api/reports/:id/priority", priorityRoute);
app.route("/api/reports/:id/photos/upload-url", photosUploadUrlRoute);
app.route("/api/reports/:id/photos", photosPresignedRoute);
app.route("/api/reports/:id/close", closeRoute);
app.route("/api/reports/:id/escalate", escalateRoute);
app.route("/api/reports/:id/assign", assignRoute);
app.route("/api/reports/:id/duplicates", reportDuplicatesByIdRoute);
app.route("/api/reports/:id/merge", mergeRoute);
app.route("/api/reports/:id/sanggahan", sanggahanRoute);
app.route("/api/reports/:id/reopen", reopenRoute);
app.route("/api/reports/:id/self-close", selfCloseRoute);
app.route("/api/reports/:id/community-update", communityUpdateRoute);
app.route("/api/reports/:id/evidence", evidenceRoute);
app.route("/api/map", mapRoutes);
app.route("/api/export/geojson", exportGeojsonRoute);
app.route("/api/export/csv", exportCsvRoute);
app.route("/api/export/pdf", exportPdfRoute);
app.route("/api/export", exportRoutes);
app.route("/api/agent/assess", agentAssessRoute);
app.route("/api/agent/assessments", agentAssessmentsRoute);
app.route("/api/agent", agentActionsRoute);
app.route("/api/tasks", tasksRoute);
app.route("/api/tasks/:id", taskDetailRoute);
app.route("/api/tasks/:id/checklist-template", taskChecklistTemplateRoute);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/notifications/mark-read", markReadRoute);
app.route("/api/sync/batch", syncBatchRoute);
app.route("/api/sync/status", syncStatusRoute);
app.route("/api/facilities", facilitiesIndexRoute);
app.route("/api/facilities/cluster", facilitiesClusterRoute);
app.route("/api/stats", statsRoute);
app.route("/api/config", configRoute);
app.route("/api/units", unitsRoute);
app.route("/api/gamification", gamificationRoute);

// ═══════════════════════════════════════════════════════════════════
// requireRole("ADMIN") — admin-only route groups

app.use("/api/admin", requireAuth, requireRole("ADMIN"));
app.use("/api/regional", requireAuth, requireRole("ADMIN"));
app.use("/api/analytics", requireAuth, requireRole("ADMIN"));
app.use("/api/audit", requireAuth, requireRole("ADMIN"));
app.use("/api/priority-config", requireAuth, requireRole("ADMIN"));
app.use("/api/users", requireAuth, requireRole("ADMIN"));
app.use("/api/stats/sync-quality", requireAuth, requireRole("ADMIN"));

// requireRole("ADMIN","PETUGAS") — case queue shared between admin and petugas

app.use("/api/cases", requireAuth, requireRole("ADMIN", "PETUGAS"));
app.use("/api/cases/*", requireAuth, requireRole("ADMIN", "PETUGAS"));
for (const prefix of [
  "admin",
  "regional",
  "analytics",
  "audit",
  "priority-config",
  "users",
]) {
  app.use(`/api/${prefix}/*`, requireAuth, requireRole("ADMIN"));
}

// ── ADMIN route registrations ──────────────────────────────────────
app.route("/api/admin/integrations", integrationsRoute);
app.route("/api/admin/photo-metadata/migrate", photoMetadataMigrationRoute);
app.route("/api/admin/failed-assessments", adminFailedAssessmentsRoute);
app.route("/api/admin/categories/:id", adminCategoryRoutes);
app.route("/api/admin/failed-assessments/retry-batch", retryBatchRoute);
app.route("/api/admin/users", adminUsersRoute);
app.route("/api/regional/dashboard", regionalDashboardRoute);
app.route("/api/regional/cases", regionalCasesRoute);
app.route("/api/regional/operators", regionalOperatorsRoute);
app.route("/api/regional/petugas", regionalPetugasRoute);
app.route("/api/regional/sla", regionalSlaRoute);
app.route("/api/regional/sla/:id", regionalSlaDetailRoute);
app.route("/api/regional/units", regionalUnitsRoute);

app.route("/api/audit/audit-search", auditSearchRoute);
app.route("/api/audit/audit-export", auditExportRoute);
app.route("/api/audit/stats", auditStatsRoute);
app.route("/api/audit/verify-chain", auditVerifyChainRoute);
app.route("/api/analytics/dashboard", analyticsDashboardRoute);
app.route("/api/analytics/regional-stats", analyticsRegionalStatsRoute);
app.route("/api/analytics/trend-analysis", analyticsTrendRoute);
app.route("/api/cases/queue", casesQueueRoute);
// Specific sub-routes BEFORE catch-all
app.route("/api/cases/:id/accept", casesAcceptRoute);
app.route("/api/cases/:id/decide", casesDecideRoute);
app.route("/api/cases/:id/reject", casesRejectRoute);
app.route("/api/cases/:id/combine", casesCombineRoute);
app.route("/api/cases/:id/separate", casesSeparateRoute);
app.route("/api/cases/:id/review-sanggahan", casesReviewSanggahanRoute);
app.route("/api/cases/:id/verify-completion", casesVerifyCompletionRoute);
app.route("/api/cases/:id/override-priority", casesOverridePriorityRoute);
app.route("/api/cases/:id/priority-breakdown", casesPriorityBreakdownRoute);
// Catch-all detail route LAST
app.route("/api/cases/:id", caseDetailRoute);
app.route("/api/priority-config", priorityConfigRoute);
app.route("/api/priority-config/:version", priorityConfigDetailRoute);
app.route(
  "/api/priority-config/:version/activate",
  priorityConfigActivateRoute,
);
app.route("/api/users", usersRoute);
app.route("/api/stats/sync-quality", syncQualityRoute);

// ═══════════════════════════════════════════════════════════════════
// requireRole("ADMIN","PETUGAS") — task operation sub-routes
// ═══════════════════════════════════════════════════════════════════
app.use("/api/tasks/:id/accept", requireRole("ADMIN", "PETUGAS"));
app.use("/api/tasks/:id/start", requireRole("ADMIN", "PETUGAS"));
app.use("/api/tasks/:id/progress", requireRole("ADMIN", "PETUGAS"));
app.use("/api/tasks/:id/complete", requireRole("ADMIN", "PETUGAS"));
app.use("/api/tasks/:id/reject", requireRole("ADMIN", "PETUGAS"));
app.use("/api/tasks/:id/clarification", requireRole("ADMIN", "PETUGAS"));
app.use("/api/tasks/:id/evidence", requireRole("ADMIN", "PETUGAS"));
app.use("/api/tasks/:id/visit", requireRole("ADMIN", "PETUGAS"));
app.use("/api/reports/:id/assign", requireRole("ADMIN", "PETUGAS"));

// ── Task operation route registrations ─────────────────────────────
app.route("/api/tasks/:id/accept", taskAcceptRoute);
app.route("/api/tasks/:id/start", taskStartRoute);
app.route("/api/tasks/:id/progress", taskProgressRoute);
app.route("/api/tasks/:id/complete", taskCompleteRoute);
app.route("/api/tasks/:id/reject", taskRejectRoute);
app.route("/api/tasks/:id/clarification", taskClarificationRoute);
app.route("/api/tasks/:id/evidence", taskEvidenceRoute);
app.route("/api/tasks/:id/visit", taskVisitRoute);

// ── Error handling ─────────────────────────────────────────────────
app.onError((err, c) => {
  const errorId = crypto.randomUUID();
  logger.error({
    route: c.req.path,
    method: c.req.method,
    error: err,
    errorId,
    user_id: c.get("user")?.sub,
  });
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: err.message || String(err),
        errorId,
      },
    },
    500,
  );
});
app.notFound((c) => {
  return c.json(
    { error: { code: "NOT_FOUND", message: "Rute tidak ditemukan" } },
    404,
  );
});

// ── Scheduled handler ──────────────────────────────────────────────
async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  operation: string,
): Promise<void> {
  await flushPendingPush(env).catch(() =>
    console.error("Scheduled push outbox unavailable"),
  );
  logger.info({
    route: "/cron",
    method: "SCHEDULED",
    operation,
    context: "cron_trigger_fired",
  });
  try {
    await processFailedAssessments(env, undefined, 50);
    logger.info({
      route: "/cron",
      method: "SCHEDULED",
      operation,
      context: "cron_failed_assessments_processed",
    });
  } catch (err) {
    logger.error({
      route: "/cron",
      method: "SCHEDULED",
      operation,
      context: "cron_failed_assessments_error",
      error: err as Error,
    });
  }
  try {
    await cleanupRevokedTokens(env);
    logger.info({
      route: "/cron",
      method: "SCHEDULED",
      operation,
      context: "cron_revoked_tokens_cleanup_processed",
    });
  } catch (err) {
    logger.error({
      route: "/cron",
      method: "SCHEDULED",
      operation,
      context: "cron_revoked_tokens_cleanup_error",
      error: err as Error,
    });
  }
  try {
    await cleanupAuditLog(env);
    logger.info({
      route: "/cron",
      method: "SCHEDULED",
      operation,
      context: "cron_audit_log_cleanup_processed",
    });
  } catch (err) {
    logger.error({
      route: "/cron",
      method: "SCHEDULED",
      operation,
      context: "cron_audit_log_cleanup_error",
      error: err as Error,
    });
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      return await app.fetch(request, env, ctx);
    } finally {
      ctx.waitUntil(
        flushPendingPush(env).catch(() =>
          console.error("Push outbox unavailable"),
        ),
      );
    }
  },
  scheduled: handleScheduled,
};
