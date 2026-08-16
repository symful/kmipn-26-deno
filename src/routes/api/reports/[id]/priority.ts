import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const priorityRoute = new Hono<{ Bindings: Env }>();

priorityRoute.get("/", requireAuth, safeHandler(async (c) => {
  const reportId = c.req.param("id");

  const priority = await withClient(c.env, async (client) => {
    // Get priority score
    const scoreR = await client.query(
      `SELECT ps.computed_score, ps.severity_component, ps.population_component,
              ps.vulnerability_component, ps.override_score,
              pc.model_version
       FROM priority_scores ps
       JOIN priority_config pc ON pc.id = ps.config_version
       WHERE ps.report_id = $1`,
      [reportId]
    );

    // Get report for severity/population
    const reportR = await client.query(
      `SELECT severity, population_affected, vulnerability_index FROM reports WHERE id = $1`,
      [reportId]
    );

    if (!reportR.rows[0]) {
      return null;
    }

    const report = reportR.rows[0];
    const score = scoreR.rows[0];

    const total = score?.override_score ?? score?.computed_score ?? Math.round(
      (report.severity * 40 + report.population_affected / 10 * 30 + report.vulnerability_index * 100 * 30) / 100
    );

    const confidence = total >= 70 ? "tinggi" : total >= 40 ? "sedang" : "rendah";

    return {
      total,
      confidence,
      model_version: score?.model_version ?? "2.3",
      factors: [
        { name: "Keselamatan", value: score?.severity_component ?? report.severity * 20, max: 100 },
        { name: "Populasi", value: score?.population_component ?? Math.min(report.population_affected, 100), max: 100 },
        { name: "Kerentanan", value: score?.vulnerability_component ?? Math.round(report.vulnerability_index * 100), max: 100 },
      ],
    };
  });

  if (!priority) {
    return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
  }

  return c.json(priority);
}));
