import { H as Hono, c as cspMiddleware, h as healthRoute, a as clientErrorsRoute, b as categoriesRoute, d as categorySubtreeRoute, w as wilayahRoute, e as wilayahBoundaryRoute, f as authLoginRoute, g as authRefreshRoute, i as authLogoutRoute, r as registerVerifikatorRoute, j as authValidateRoleRoute, k as reportsIndexRoute, l as reportsStatsRoute, m as reportsHeatmapRoute, s as shareFilterRoute, n as reportsNearbyRoute, o as sharedFilterRoute, p as reportByIdRoute, q as priorityRoute, t as photosUploadUrlRoute, u as closeRoute, v as shareRoute, x as escalateRoute, y as resolveRoute, z as assignRoute, A as reportTimelineRoute, B as reportSupportingRoute, C as reportsDuplicatesRoute, D as syncBatchRoute, E as exportGeojsonRoute, F as exportCsvRoute, G as publicGeojsonRoute, I as publicReportsGeojsonRoute, J as publicReportsRoute, K as publicReportsClusterRoute, L as publicCasesRoute, M as publicCategoriesRoute, N as publicStatsRoute, O as publicHealthRoute, P as agentAssessRoute, Q as agentAssessmentsRoute, R as surveyorTasksRoute, S as surveyorTaskDetailRoute, T as surveyorVisitRoute, U as surveyorChecklistTemplateRoute, V as surveyorTaskAcceptRoute, W as surveyorTaskStartRoute, X as rtRwVerifyRoute, Y as generateRtRwTokenRoute, Z as adminUsersRoute, _ as verifikatorQueueRoute, $ as verifikatorCaseRoute, a0 as acceptRoute, a1 as combineRoute, a2 as separateRoute, a3 as rejectRoute, a4 as decideRoute, a5 as reviewSanggahanRoute, a6 as verifyCompletionRoute, a7 as auditSearchRoute, a8 as auditExportRoute, a9 as auditVerifyChainRoute, aa as publicSyncBatchRoute, ab as publicSyncKpiRoute, ac as outboxRoute, ad as outboxDlqRoute, ae as outboxProcessRoute, af as meDataRoute, ag as outboxRetryRoute, ah as notificationsRoute, ai as markReadRoute, aj as unitsRoute, ak as adminChecklistTemplatesRoute, al as adminSyncKpiRoute, am as priorityConfigRoute, an as adminOutboxRoute, ao as adminFailedAssessmentsRoute, ap as retryBatchRoute, aq as retryFailedAssessmentsRoute, ar as cleanupRevokedTokensRoute, as as inboundWebhookRoute, at as kpiSyncSuccessRoute, au as kpiVerificationDurationRoute, av as kpiAdoptionRoute, aw as adminDaerahDashboardRoute, ax as adminDaerahCasesRoute, ay as adminDaerahOperatorsRoute, az as adminDaerahPetugasRoute, aA as adminDaerahStatsRoute, aB as adminDaerahSlaRoute, aC as adminDaerahSlaDetailRoute, aD as adminDaerahUnitsRoute, aE as adminDaerahUnitsDetailRoute, aF as operatorIndexRoute, aG as operatorStatsRoute, aH as operatorMergeRoute, aI as operatorSeparateRoute, aJ as operatorPriorityRoute, aK as operatorAssignRoute, aL as operatorEscalateRoute, aM as operatorSlaRoute, aN as operatorQueueCountsRoute, aO as operatorBacklogRoute, aP as facilitiesClusterRoute, aQ as syncKpiSummaryRoute, aR as reportImpactRoute, aS as surveyorTasksDownloadBatchRoute, aT as petugasTasksRoute, aU as petugasTaskDetailRoute, aV as petugasAcceptRoute, aW as petugasProgressRoute, aX as petugasEvidenceRoute, aY as petugasCompleteRoute, aZ as petugasClarificationRoute, a_ as petugasRejectRoute, a$ as auditorAuditSearchRoute, b0 as auditorAuditExportRoute, b1 as auditorSystemLogsRoute, b2 as auditorStatsRoute, b3 as executiveDashboardRoute, b4 as executiveRegionalStatsRoute, b5 as executiveTrendAnalysisRoute, b6 as agentConsolidateRoute, b7 as facilitiesIndexRoute, b8 as facilitiesDetailRoute, b9 as facilitiesMergeRoute, ba as facilitiesSplitRoute, bb as wargaSanggahanRoute, bc as wargaReopenRoute, bd as wargaEvidenceRoute, be as geocodeRoute, bf as logger, bg as processStuckOutbox, bh as processPendingOutbox, bi as processFailedAssessments, bj as cleanupRevokedTokens } from "./assets/reverse-vDZKRD7n.js";
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
app.route("/api/categories/:id/subtree", categorySubtreeRoute);
app.route("/api/wilayah", wilayahRoute);
app.route("/api/wilayah/:id/boundary", wilayahBoundaryRoute);
app.route("/api/auth/login", authLoginRoute);
app.route("/api/auth/refresh", authRefreshRoute);
app.route("/api/auth/logout", authLogoutRoute);
app.route("/api/auth/register-verifikator", registerVerifikatorRoute);
app.route("/api/auth/validate-role", authValidateRoleRoute);
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
app.route("/api/sync/batch", syncBatchRoute);
app.route("/api/export/geojson", exportGeojsonRoute);
app.route("/api/export/csv", exportCsvRoute);
app.route("/api/public/geojson", publicGeojsonRoute);
app.route("/api/public/reports.geojson", publicReportsGeojsonRoute);
app.route("/api/public/reports", publicReportsRoute);
app.route("/api/public/reports/cluster", publicReportsClusterRoute);
app.route("/api/public/cases", publicCasesRoute);
app.route("/api/public/categories", publicCategoriesRoute);
app.route("/api/public/stats", publicStatsRoute);
app.route("/api/public/health", publicHealthRoute);
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
app.route("/api/audit/verify-chain", auditVerifyChainRoute);
app.route("/api/public/sync/batch", publicSyncBatchRoute);
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
app.route("/api/admin/sync-kpi", adminSyncKpiRoute);
app.route("/api/admin/priority-config", priorityConfigRoute);
app.route("/api/admin/outbox", adminOutboxRoute);
app.route("/api/admin/failed-assessments", adminFailedAssessmentsRoute);
app.route("/api/admin/failed-assessments", retryBatchRoute);
app.route("/api/cron/retry-failed-assessments", retryFailedAssessmentsRoute);
app.route("/api/cron/cleanup-revoked-tokens", cleanupRevokedTokensRoute);
app.route("/api/webhooks/inbound", inboundWebhookRoute);
app.route("/api/admin/kpis/sync-success-rate", kpiSyncSuccessRoute);
app.route("/api/admin/kpis/verification-duration", kpiVerificationDurationRoute);
app.route("/api/admin/kpis/adoption-rate", kpiAdoptionRoute);
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
app.route("/api/facilities/cluster", facilitiesClusterRoute);
app.route("/api/sync-kpi/summary", syncKpiSummaryRoute);
app.route("/api/reports/:id/impact", reportImpactRoute);
app.route("/api/surveyor/tasks/download-batch", surveyorTasksDownloadBatchRoute);
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
app.route("/api/agent/consolidate", agentConsolidateRoute);
app.route("/api/facilities", facilitiesIndexRoute);
app.route("/api/facilities/:id", facilitiesDetailRoute);
app.route("/api/facilities/:id/merge", facilitiesMergeRoute);
app.route("/api/facilities/:id/split", facilitiesSplitRoute);
app.route("/api/warga/sanggahan/:id", wargaSanggahanRoute);
app.route("/api/warga/reopen/:id", wargaReopenRoute);
app.route("/api/warga/evidence/:id", wargaEvidenceRoute);
app.route("/api/geocode", geocodeRoute);
app.onError((err, c) => {
  logger.error({
    route: c.req.path,
    method: c.req.method,
    error: err,
    user_id: c.get("user")?.sub
  });
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: err.message || String(err)
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
