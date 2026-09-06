import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { rateLimit } from "@/lib/ratelimit";
import { redactText } from "@/lib/agent/redaction";

const publicCasesRoutes = new Hono<{ Bindings: Env }>();

// ─── GET /api/public/cases/:id/share ─────────────────────────────────────────
// Returns Open Graph meta for social sharing of a report.
// The :id path param IS a report id (PublicCaseList links to /public/cases/${report.id}).
// Publicly accessible, no auth required.
// Rate-limited: 10 requests per minute per IP.
publicCasesRoutes.use(
  "/:id/share",
  rateLimit({
    limit: 10,
    windowMs: 60_000,
    keyBy: (c) => c.req.header("cf-connecting-ip") ?? "anonymous",
  }),
);

publicCasesRoutes.get("/:id/share", async (c) => {
  const reportId = c.req.param("id");

  // Directly fetch the report — cases table is vestigial (COUNT=0, never populated in prod)
  const report = await c.env.D1.prepare(
    `SELECT id, title, description, photo_urls
     FROM reports
     WHERE id = ? AND merged_into IS NULL AND status NOT IN ('draft','rejected','out_of_scope')`,
  )
    .bind(reportId)
    .first<{
      id: string;
      title: string | null;
      description: string;
      photo_urls: string | null;
    }>();

  if (!report) {
    return c.json({ error: "not_found", message: "Report not found" }, 404);
  }

  // Build description from report description (≤200 chars, no reporter identity)
  const description = redactText(report.description ?? "").slice(0, 200);

  // Build image from first photo URL if available
  let image = "";
  if (report.photo_urls) {
    try {
      const urls = JSON.parse(report.photo_urls) as string[];
      if (urls.length > 0) {
        const r2Base = (c.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
        image = urls[0]!.startsWith("http")
          ? urls[0]!
          : `${r2Base}/${urls[0]!.replace(/^\/?r2\//, "").replace(/^\//, "")}`;
      }
    } catch {
      // ignore parse errors
    }
  }

  // Build public URL for this report share
  const appBase = (c.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  const shareUrl = `${appBase}/public/cases/${reportId}`;

  return c.json({
    url: shareUrl,
    og: {
      title: redactText(report.title ?? "Laporan Masyarakat"),
      description,
      image,
      type: "article" as const,
    },
  });
});

export { publicCasesRoutes };
