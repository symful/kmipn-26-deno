import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { ID_REGEX } from "@/lib/id";
import { getPriorityScore } from "@/lib/priority/calculator";

export const casesPriorityBreakdownRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

casesPriorityBreakdownRoute.get(
  "/",
  safeHandler(async (c) => {
    const reportId = c.req.param("id");
    if (!reportId || !ID_REGEX.test(reportId)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "ID laporan tidak valid",
          },
        },
        400,
      );
    }

    const reportR = await c.env.D1.prepare(
      `SELECT id FROM reports WHERE id = ?`,
    )
      .bind(reportId)
      .first<{ id: string }>();
    if (!reportR) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Laporan tidak ditemukan" } },
        404,
      );
    }

    const result = await getPriorityScore(c.env, reportId);
    if (!result) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Skor prioritas belum dihitung untuk laporan ini",
          },
        },
        404,
      );
    }

    const formula = await c.env.D1.prepare(
      "SELECT weights FROM priority_formula_versions WHERE version = ?",
    )
      .bind(result.config_version)
      .first<{ weights: string }>();
    return c.json({
      report_id: reportId,
      total_score: result.total_score,
      breakdown: {
        safety: result.breakdown.severity,
        impact: result.breakdown.impact,
        supporting_reports: result.breakdown.report_count,
        sla: result.breakdown.sla,
      },
      formula_version: result.config_version,
      weights: formula ? JSON.parse(formula.weights) : null,
      inputs: result.inputs,
      confidence: null,
    });
  }),
);
