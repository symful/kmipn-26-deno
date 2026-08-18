import { H as Hono, c as cspMiddleware, h as healthRoute, a as clientErrorsRoute, b as categoriesRoute, w as wilayahRoute, d as wilayahBoundaryRoute, e as authLoginRoute, f as authRefreshRoute, g as authLogoutRoute, r as registerVerifikatorRoute, i as reportsIndexRoute, j as reportsStatsRoute, k as reportsHeatmapRoute, s as shareFilterRoute, l as reportsNearbyRoute, m as sharedFilterRoute, n as reportByIdRoute, p as priorityRoute, o as photosUploadUrlRoute, q as closeRoute, t as shareRoute, u as escalateRoute, v as resolveRoute, x as assignRoute, y as reportTimelineRoute, z as reportSupportingRoute, A as reportsDuplicatesRoute, B as exportGeojsonRoute, C as exportCsvRoute, D as publicGeojsonRoute, E as publicReportsGeojsonRoute, F as publicReportsClusterRoute, G as publicReportsRoute, I as publicCasesRoute, J as publicCategoriesRoute, K as publicStatsRoute, L as publicHealthRoute, M as anonymousReportsRoute, N as agentAssessRoute, O as agentAssessmentsRoute, P as surveyorTasksRoute, Q as surveyorTaskDetailRoute, R as surveyorVisitRoute, S as surveyorChecklistTemplateRoute, T as surveyorTaskAcceptRoute, U as surveyorTaskStartRoute, V as rtRwVerifyRoute, W as generateRtRwTokenRoute, X as adminUsersRoute, Y as verifikatorQueueRoute, Z as verifikatorCaseRoute, _ as acceptRoute, $ as combineRoute, a0 as separateRoute, a1 as rejectRoute, a2 as decideRoute, a3 as reviewSanggahanRoute, a4 as verifyCompletionRoute, a5 as auditSearchRoute, a6 as auditExportRoute, a7 as publicSyncKpiRoute, a8 as outboxRoute, a9 as outboxDlqRoute, aa as outboxProcessRoute, ab as meDataRoute, ac as outboxRetryRoute, ad as notificationsRoute, ae as markReadRoute, af as unitsRoute, ag as adminChecklistTemplatesRoute, ah as priorityConfigRoute, ai as adminOutboxRoute, aj as adminFailedAssessmentsRoute, ak as retryBatchRoute, al as inboundWebhookRoute, am as adminDaerahDashboardRoute, an as adminDaerahCasesRoute, ao as adminDaerahOperatorsRoute, ap as adminDaerahPetugasRoute, aq as adminDaerahStatsRoute, ar as adminDaerahSlaRoute, as as adminDaerahSlaDetailRoute, at as adminDaerahUnitsRoute, au as adminDaerahUnitsDetailRoute, av as operatorIndexRoute, aw as operatorStatsRoute, ax as operatorMergeRoute, ay as operatorSeparateRoute, az as operatorPriorityRoute, aA as operatorAssignRoute, aB as operatorEscalateRoute, aC as operatorSlaRoute, aD as operatorQueueCountsRoute, aE as operatorBacklogRoute, aF as reportImpactRoute, aG as petugasTasksRoute, aH as petugasTaskDetailRoute, aI as petugasAcceptRoute, aJ as petugasProgressRoute, aK as petugasEvidenceRoute, aL as petugasCompleteRoute, aM as petugasClarificationRoute, aN as petugasRejectRoute, aO as auditorAuditSearchRoute, aP as auditorAuditExportRoute, aQ as auditorSystemLogsRoute, aR as auditorStatsRoute, aS as executiveDashboardRoute, aT as executiveRegionalStatsRoute, aU as executiveTrendAnalysisRoute, aV as wargaSanggahanRoute, aW as wargaReopenRoute, aX as wargaEvidenceRoute, aY as geocodeRoute, aZ as testResetRoute, a_ as logger, a$ as processStuckOutbox, b0 as processPendingOutbox, b1 as processFailedAssessments, b2 as cleanupRevokedTokens } from "./assets/reset-u6wTMVTA.js";
import "events";
import "crypto";
import "dns";
import "fs";
import "net";
import "tls";
import "path";
import "stream";
import "readline";
import "util";
const app = new Hono();
app.use("*", cspMiddleware);
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  const allowedOrigins = c.env.ALLOWED_ORIGINS;
  const requestOrigin = c.req.header("Origin") ?? "";
  if (allowedOrigins && requestOrigin) {
    const allowlist = allowedOrigins.split(",").map((o) => o.trim());
    if (allowlist.includes(requestOrigin)) {
      c.header("Access-Control-Allow-Origin", requestOrigin);
    }
  }
  if (c.req.method === "OPTIONS") return c.text("", 204);
  return await next();
});
app.route("/api/health", healthRoute);
app.route("/api/client-errors", clientErrorsRoute);
app.route("/api/categories", categoriesRoute);
app.route("/api/wilayah", wilayahRoute);
app.route("/api/wilayah/:id/boundary", wilayahBoundaryRoute);
app.route("/api/auth/login", authLoginRoute);
app.route("/api/auth/refresh", authRefreshRoute);
app.route("/api/auth/logout", authLogoutRoute);
app.route("/api/auth/register-verifikator", registerVerifikatorRoute);
app.route("/api/reports", reportsIndexRoute);
app.route("/api/reports/stats", reportsStatsRoute);
app.route("/api/reports/heatmap", reportsHeatmapRoute);
app.route("/api/reports/share-filter", shareFilterRoute);
app.route("/api/reports/nearby", reportsNearbyRoute);
app.route("/api/shared/:token", sharedFilterRoute);
app.route("/api/reports/:id", reportByIdRoute);
app.route("/api/reports/:id/priority", priorityRoute);
app.route("/api/reports/:id/photos/upload-url", photosUploadUrlRoute);
app.route("/api/reports/:id/close", closeRoute);
app.route("/api/reports/:id/share", shareRoute);
app.route("/api/reports/:id/escalate", escalateRoute);
app.route("/api/reports/:id/resolve", resolveRoute);
app.route("/api/reports/:id/assign", assignRoute);
app.route("/api/reports/:id/timeline", reportTimelineRoute);
app.route("/api/reports/:id/supporting", reportSupportingRoute);
app.route("/api/reports/duplicates", reportsDuplicatesRoute);
app.route("/api/export/geojson", exportGeojsonRoute);
app.route("/api/export/csv", exportCsvRoute);
app.route("/api/public/geojson", publicGeojsonRoute);
app.route("/api/public/reports.geojson", publicReportsGeojsonRoute);
app.route("/api/public/reports/cluster", publicReportsClusterRoute);
app.route("/api/public/reports", publicReportsRoute);
app.route("/api/public/cases", publicCasesRoute);
app.route("/api/public/categories", publicCategoriesRoute);
app.route("/api/public/stats", publicStatsRoute);
app.route("/api/public/health", publicHealthRoute);
app.route("/api/public/anonymous-reports", anonymousReportsRoute);
app.route("/api/agent/assess", agentAssessRoute);
app.route("/api/agent/assessments", agentAssessmentsRoute);
app.route("/api/surveyor/tasks", surveyorTasksRoute);
app.route("/api/surveyor/tasks/:id", surveyorTaskDetailRoute);
app.route("/api/surveyor/tasks/:id/visit", surveyorVisitRoute);
app.route("/api/surveyor/tasks/:id/checklist-template", surveyorChecklistTemplateRoute);
app.route("/api/surveyor/tasks/:id/accept", surveyorTaskAcceptRoute);
app.route("/api/surveyor/tasks/:id/start", surveyorTaskStartRoute);
app.route("/api/rt-rw/verify", rtRwVerifyRoute);
app.route("/api/admin/generate-rt-rw-token", generateRtRwTokenRoute);
app.route("/api/admin/users", adminUsersRoute);
app.route("/api/verifikator/queue", verifikatorQueueRoute);
app.route("/api/verifikator/cases/:id", verifikatorCaseRoute);
app.route("/api/verifikator/cases/:id/accept", acceptRoute);
app.route("/api/verifikator/cases/:id/combine", combineRoute);
app.route("/api/verifikator/cases/:id/separate", separateRoute);
app.route("/api/verifikator/cases/:id/reject", rejectRoute);
app.route("/api/verifikator/cases/:id/decide", decideRoute);
app.route("/api/verifikator/cases/:id/review-sanggahan", reviewSanggahanRoute);
app.route("/api/verifikator/cases/:id/verify-completion", verifyCompletionRoute);
app.route("/api/audit/search", auditSearchRoute);
app.route("/api/audit/export", auditExportRoute);
app.route("/api/public/sync-kpi", publicSyncKpiRoute);
app.route("/api/outbox", outboxRoute);
app.route("/api/outbox/dlq", outboxDlqRoute);
app.route("/api/outbox/process", outboxProcessRoute);
app.route("/api/me/data", meDataRoute);
app.route("/api/outbox/:id/retry", outboxRetryRoute);
app.route("/api/notifications", notificationsRoute);
app.route("/api/notifications/mark-read", markReadRoute);
app.route("/api/admin/units", unitsRoute);
app.route("/api/admin/checklist-templates", adminChecklistTemplatesRoute);
app.route("/api/admin/priority-config", priorityConfigRoute);
app.route("/api/admin/outbox", adminOutboxRoute);
app.route("/api/admin/failed-assessments", adminFailedAssessmentsRoute);
app.route("/api/admin/failed-assessments/retry-batch", retryBatchRoute);
app.route("/api/webhooks/inbound", inboundWebhookRoute);
app.route("/api/admin-daerah/dashboard", adminDaerahDashboardRoute);
app.route("/api/admin-daerah/cases", adminDaerahCasesRoute);
app.route("/api/admin-daerah/operators", adminDaerahOperatorsRoute);
app.route("/api/admin-daerah/petugas", adminDaerahPetugasRoute);
app.route("/api/admin-daerah/stats", adminDaerahStatsRoute);
app.route("/api/admin-daerah/sla", adminDaerahSlaRoute);
app.route("/api/admin-daerah/sla/:id", adminDaerahSlaDetailRoute);
app.route("/api/admin-daerah/units", adminDaerahUnitsRoute);
app.route("/api/admin-daerah/units/:id", adminDaerahUnitsDetailRoute);
app.route("/api/operator", operatorIndexRoute);
app.route("/api/operator/stats", operatorStatsRoute);
app.route("/api/operator/cases/:id/merge", operatorMergeRoute);
app.route("/api/operator/cases/:id/separate", operatorSeparateRoute);
app.route("/api/operator/cases/:id/priority", operatorPriorityRoute);
app.route("/api/operator/cases/:id/assign", operatorAssignRoute);
app.route("/api/operator/cases/:id/escalate", operatorEscalateRoute);
app.route("/api/operator/cases/:id/sla", operatorSlaRoute);
app.route("/api/operator/queue-counts", operatorQueueCountsRoute);
app.route("/api/operator/backlog", operatorBacklogRoute);
app.route("/api/reports/:id/impact", reportImpactRoute);
app.route("/api/petugas/tasks", petugasTasksRoute);
app.route("/api/petugas/tasks/:id", petugasTaskDetailRoute);
app.route("/api/petugas/tasks/:id/accept", petugasAcceptRoute);
app.route("/api/petugas/tasks/:id/progress", petugasProgressRoute);
app.route("/api/petugas/tasks/:id/evidence", petugasEvidenceRoute);
app.route("/api/petugas/tasks/:id/complete", petugasCompleteRoute);
app.route("/api/petugas/tasks/:id/clarification", petugasClarificationRoute);
app.route("/api/petugas/tasks/:id/reject", petugasRejectRoute);
app.route("/api/auditor/audit-search", auditorAuditSearchRoute);
app.route("/api/auditor/audit-export", auditorAuditExportRoute);
app.route("/api/auditor/system-logs", auditorSystemLogsRoute);
app.route("/api/auditor/stats", auditorStatsRoute);
app.route("/api/executive/dashboard", executiveDashboardRoute);
app.route("/api/executive/regional-stats", executiveRegionalStatsRoute);
app.route("/api/executive/trend-analysis", executiveTrendAnalysisRoute);
app.route("/api/warga/sanggahan/:id", wargaSanggahanRoute);
app.route("/api/warga/reopen/:id", wargaReopenRoute);
app.route("/api/warga/evidence/:id", wargaEvidenceRoute);
app.route("/api/geocode", geocodeRoute);
app.route("/api/test/reset", testResetRoute);
app.onError((err, c) => {
  const errorId = crypto.randomUUID();
  logger.error({
    route: c.req.path,
    method: c.req.method,
    error: err,
    errorId,
    user_id: c.get("user")?.sub
  });
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: err.message || String(err),
        stack: String(err.stack),
        errorId
      }
    },
    500
  );
});
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Rute tidak ditemukan"
      }
    },
    404
  );
});
async function handleScheduled(controller, env, operation) {
  logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_trigger_fired" });
  try {
    const stuck = await processStuckOutbox(env);
    if (stuck.reset > 0) {
      logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_outbox_stuck_reset", count: stuck.reset });
    }
    await processPendingOutbox(env, void 0, 100);
    logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_outbox_processed" });
  } catch (err) {
    logger.error({ route: "/cron", method: "SCHEDULED", operation, context: "cron_outbox_error", error: err });
  }
  try {
    await processFailedAssessments(env, void 0, 50);
    logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_failed_assessments_processed" });
  } catch (err) {
    logger.error({ route: "/cron", method: "SCHEDULED", operation, context: "cron_failed_assessments_error", error: err });
  }
  try {
    await cleanupRevokedTokens(env);
    logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_revoked_tokens_cleanup_processed" });
  } catch (err) {
    logger.error({ route: "/cron", method: "SCHEDULED", operation, context: "cron_revoked_tokens_cleanup_error", error: err });
  }
}
const index = {
  fetch: app.fetch,
  scheduled: handleScheduled
};
const workerEntry = index ?? {};
export {
  workerEntry as default
};
