import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { logger } from "./lib/logger";
import { cspMiddleware } from "@/middleware/csp";
import { healthRoute } from "@/routes/api/health";
import { clientErrorsRoute } from "@/routes/api/client-errors";
import { categoriesRoute } from "@/routes/api/categories";
import { wilayahRoute } from "@/routes/api/wilayah";
import { wilayahBoundaryRoute } from "@/routes/api/wilayah/[id]/boundary";
import { authLoginRoute } from "@/routes/api/auth/login";
import { authRefreshRoute } from "@/routes/api/auth/refresh";
import { authLogoutRoute } from "@/routes/api/auth/logout";
import { registerVerifikatorRoute } from "@/routes/api/auth/register-verifikator";
import { reportsIndexRoute } from "@/routes/api/reports/index";
import { reportsStatsRoute } from "@/routes/api/reports/stats";
import { reportsHeatmapRoute } from "@/routes/api/reports/heatmap";
import { shareFilterRoute } from "@/routes/api/reports/share-filter";
import { reportsNearbyRoute } from "@/routes/api/reports/nearby";
import { sharedFilterRoute } from "@/routes/api/shared/[token]";
import { reportByIdRoute } from "@/routes/api/reports/[id]";
import { priorityRoute } from "@/routes/api/reports/[id]/priority";
import { photosUploadUrlRoute } from "@/routes/api/reports/photos/upload-url";
import { closeRoute } from "@/routes/api/reports/[id]/close";
import { shareRoute } from "@/routes/api/reports/[id]/share";
import { escalateRoute } from "@/routes/api/reports/[id]/escalate";
import { resolveRoute } from "@/routes/api/reports/[id]/resolve";
import { assignRoute } from "@/routes/api/reports/[id]/assign";
import { reportTimelineRoute } from "@/routes/api/reports/[id]/timeline";
import { reportSupportingRoute } from "@/routes/api/reports/[id]/supporting";
import { reportsDuplicatesRoute } from "@/routes/api/reports/duplicates";
import { exportGeojsonRoute } from "@/routes/api/export/geojson";
import { exportCsvRoute } from "@/routes/api/export/csv";
import { publicGeojsonRoute } from "@/routes/api/public/geojson";
import { publicReportsGeojsonRoute } from "@/routes/api/public/reports.geojson";
import { publicReportsRoute } from "@/routes/api/public/reports";
import { publicReportsClusterRoute } from "@/routes/api/public/reports/cluster";
import { publicCasesRoute } from "@/routes/api/public/cases/[id]";
import { publicCategoriesRoute } from "@/routes/api/public/categories";
import { publicStatsRoute } from "@/routes/api/public/stats";
import { publicHealthRoute } from "@/routes/api/public/health";
import { anonymousReportsRoute } from "@/routes/api/public/anonymous-reports";
import { agentAssessRoute } from "@/routes/api/agent/assess";
import { agentAssessmentsRoute } from "@/routes/api/agent/assessments";
import { surveyorTasksRoute } from "@/routes/api/surveyor/tasks";
import { surveyorVisitRoute } from "@/routes/api/surveyor/tasks/[id]/visit";
import { surveyorTaskDetailRoute } from "@/routes/api/surveyor/tasks/[id]/index";
import { surveyorChecklistTemplateRoute } from "@/routes/api/surveyor/tasks/[id]/checklist-template";
import { surveyorTaskAcceptRoute } from "@/routes/api/surveyor/tasks/[id]/accept";
import { surveyorTaskStartRoute } from "@/routes/api/surveyor/tasks/[id]/start";
import { rtRwVerifyRoute } from "@/routes/api/rt-rw/verify";
import { generateRtRwTokenRoute } from "@/routes/api/admin/generate-rt-rw-token";
import { adminUsersRoute } from "@/routes/api/admin/users";
import { verifikatorQueueRoute } from "@/routes/api/verifikator/queue";
import { verifikatorCaseRoute } from "@/routes/api/verifikator/cases/[id]";
import { acceptRoute } from "@/routes/api/verifikator/cases/[id]/accept";
import { combineRoute } from "@/routes/api/verifikator/cases/[id]/combine";
import { separateRoute } from "@/routes/api/verifikator/cases/[id]/separate";
import { rejectRoute } from "@/routes/api/verifikator/cases/[id]/reject";
import { decideRoute } from "@/routes/api/verifikator/cases/[id]/decide";
import { reviewSanggahanRoute } from "@/routes/api/verifikator/cases/[id]/review-sanggahan";
import { verifyCompletionRoute } from "@/routes/api/verifikator/cases/[id]/verify-completion";
import { auditSearchRoute } from "@/routes/api/audit/search";
import { auditExportRoute } from "@/routes/api/audit/export";
import { outboxRoute } from "@/routes/api/outbox";
import { outboxProcessRoute, processPendingOutbox, processStuckOutbox } from "@/routes/api/outbox/process";
import { processFailedAssessments, cleanupRevokedTokens } from "@/lib/cron-functions";
import { outboxRetryRoute } from "@/routes/api/outbox/[id]/retry";
import { outboxDlqRoute } from "@/routes/api/outbox/dlq";
import { meDataRoute } from "@/routes/api/me/data";
import { notificationsRoute } from "@/routes/api/notifications";
import { markReadRoute } from "@/routes/api/notifications/mark-read";
import { unitsRoute } from "@/routes/api/admin/units";
import { adminChecklistTemplatesRoute } from "@/routes/api/admin/checklist-templates";
import { priorityConfigRoute } from "@/routes/api/admin/priority-config";
import { adminOutboxRoute } from "@/routes/api/admin/outbox";
import { adminFailedAssessmentsRoute } from "@/routes/api/admin/failed-assessments";
import { retryBatchRoute } from "@/routes/api/admin/failed-assessments/retry-batch";
import { inboundWebhookRoute } from "@/routes/api/webhooks/inbound";
import { publicSyncKpiRoute } from "@/routes/api/public/sync-kpi";
import { adminDaerahDashboardRoute } from "@/routes/api/admin-daerah/dashboard";
import { adminDaerahCasesRoute } from "@/routes/api/admin-daerah/cases";
import { adminDaerahOperatorsRoute } from "@/routes/api/admin-daerah/operators";
import { adminDaerahPetugasRoute } from "@/routes/api/admin-daerah/petugas";
import { adminDaerahStatsRoute } from "@/routes/api/admin-daerah/stats";
import { adminDaerahSlaRoute } from "@/routes/api/admin-daerah/sla/index";
import { adminDaerahSlaDetailRoute } from "@/routes/api/admin-daerah/sla/[id]";
import { adminDaerahUnitsRoute } from "@/routes/api/admin-daerah/units";
import { adminDaerahUnitsDetailRoute } from "@/routes/api/admin-daerah/units/[id]";
import { operatorIndexRoute } from "@/routes/api/operator";
import { operatorStatsRoute } from "@/routes/api/operator/stats";
import { operatorQueueCountsRoute } from "@/routes/api/operator/queue-counts";
import { operatorBacklogRoute } from "@/routes/api/operator/backlog";
import { reportImpactRoute } from "@/routes/api/reports/[id]/impact";
import { operatorMergeRoute } from "@/routes/api/operator/cases/[id]/merge";
import { operatorSeparateRoute } from "@/routes/api/operator/cases/[id]/separate";
import { operatorPriorityRoute } from "@/routes/api/operator/cases/[id]/priority";
import { operatorAssignRoute } from "@/routes/api/operator/cases/[id]/assign";
import { operatorEscalateRoute } from "@/routes/api/operator/cases/[id]/escalate";
import { operatorSlaRoute } from "@/routes/api/operator/cases/[id]/sla";
import { petugasTasksRoute } from "@/routes/api/petugas/tasks";
import { petugasTaskDetailRoute } from "@/routes/api/petugas/tasks/[id]/index";
import { petugasAcceptRoute } from "@/routes/api/petugas/tasks/[id]/accept";
import { petugasProgressRoute } from "@/routes/api/petugas/tasks/[id]/progress";
import { petugasEvidenceRoute } from "@/routes/api/petugas/tasks/[id]/evidence";
import { petugasCompleteRoute } from "@/routes/api/petugas/tasks/[id]/complete";
import { petugasClarificationRoute } from "@/routes/api/petugas/tasks/[id]/clarification";
import { petugasRejectRoute } from "@/routes/api/petugas/tasks/[id]/reject";
import { auditorAuditSearchRoute } from "@/routes/api/auditor/audit-search";
import { auditorAuditExportRoute } from "@/routes/api/auditor/audit-export";
import { auditorSystemLogsRoute } from "@/routes/api/auditor/system-logs";
import { auditorStatsRoute } from "@/routes/api/auditor/stats";
import { executiveDashboardRoute } from "@/routes/api/executive/dashboard";
import { executiveRegionalStatsRoute } from "@/routes/api/executive/regional-stats";
import { executiveTrendAnalysisRoute } from "@/routes/api/executive/trend-analysis";
import { wargaSanggahanRoute } from "@/routes/api/warga/sanggahan/[id]";
import { wargaReopenRoute } from "@/routes/api/warga/reopen/[id]";
import { wargaEvidenceRoute } from "@/routes/api/warga/evidence/[id]";
import { wargaStatsRoute } from "@/routes/api/warga/stats";
import { geocodeRoute } from "@/routes/api/geocode/reverse";
import { testResetRoute } from "@/routes/api/test/reset";
import { testQueryRoute } from "@/routes/api/test/query";
import { debugReportRoute } from "@/routes/api/test/debug-report";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

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
app.route("/api/warga/stats", wargaStatsRoute);
app.route("/api/geocode", geocodeRoute);
app.route("/api/test/reset", testResetRoute);
app.route("/api/test/query", testQueryRoute);
app.route("/api/test/debug-report", debugReportRoute);

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
        stack: String(err.stack),
        errorId,
      },
    },
    500,
  );
});

app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Rute tidak ditemukan",
      },
    },
    404,
  );
});

async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  operation: string,
): Promise<void> {
  logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_trigger_fired" });
  try {
    const stuck = await processStuckOutbox(env);
    if (stuck.reset > 0) {
      logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_outbox_stuck_reset", count: stuck.reset });
    }
    await processPendingOutbox(env, undefined, 100);
    logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_outbox_processed" });
  } catch (err) {
    logger.error({ route: "/cron", method: "SCHEDULED", operation, context: "cron_outbox_error", error: err as Error });
  }
  try {
    await processFailedAssessments(env, undefined, 50);
    logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_failed_assessments_processed" });
  } catch (err) {
    logger.error({ route: "/cron", method: "SCHEDULED", operation, context: "cron_failed_assessments_error", error: err as Error });
  }
  try {
    await cleanupRevokedTokens(env);
    logger.info({ route: "/cron", method: "SCHEDULED", operation, context: "cron_revoked_tokens_cleanup_processed" });
  } catch (err) {
    logger.error({ route: "/cron", method: "SCHEDULED", operation, context: "cron_revoked_tokens_cleanup_error", error: err as Error });
  }
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
