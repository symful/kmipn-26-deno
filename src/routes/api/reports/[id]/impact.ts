import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

export const reportImpactRoute = new Hono<{ Bindings: Env }>();

reportImpactRoute.get("/", requireAuth, safeHandler(async (c) => {
  const reportId = c.req.param("id");

  const impact = await withClient(c.env, async (client) => {
    // Get the report
    const reportR = await client.query(
      `SELECT r.population_affected, r.vulnerability_index, r.severity, r.address, r.category_id,
              c.name as category_name
       FROM reports r
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.id = $1`,
      [reportId]
    );

    if (!reportR.rows[0]) {
      return null;
    }

    const report = reportR.rows[0];
    const bullets: { severity: string; text: string }[] = [];

    // Population impact
    if (report.population_affected > 100) {
      bullets.push({
        severity: "red",
        text: `Dampak pada ${report.population_affected.toLocaleString()} warga`,
      });
    } else if (report.population_affected > 0) {
      bullets.push({
        severity: "amber",
        text: `Dampak pada sekitar ${report.population_affected} warga`,
      });
    }

    // Severity
    if (report.severity >= 4) {
      bullets.push({
        severity: "red",
        text: "Tingkat kerusakan berat - segera ditindaklanjuti",
      });
    } else if (report.severity >= 3) {
      bullets.push({
        severity: "amber",
        text: "Tingkat kerusakan sedang - perlu perhatian",
      });
    }

    // Category-specific impact
    bullets.push({
      severity: "amber",
      text: `Kategori ${report.category_name} - akses publik terimbas`,
    });

    // Count supporting reports
    const supportingR = await client.query(
      `SELECT COUNT(*)::int as cnt FROM reports 
       WHERE facility_card_id = (SELECT facility_card_id FROM reports WHERE id = $1)
       AND id != $1`,
      [reportId]
    );
    const supportingCount = Number(supportingR.rows[0]?.cnt ?? 0);

    return {
      bullets,
      summary: supportingCount > 0
        ? `Konsolidasi dari ${supportingCount + 1} laporan terkait`
        : `Laporan tunggal - ${report.category_name}`,
    };
  });

  if (!impact) {
    return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);
  }

  return c.json(impact);
}));
