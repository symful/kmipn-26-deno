import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";
import { getConfig } from "@/config/env";

export const configRoute = new Hono<{ Bindings: Env }>();

// GET /api/config/statuses
// Returns all report statuses from the system
configRoute.get(
  "/statuses",
  safeHandler(async (c) => {
    const statuses = [
      { value: "draft", label: "Draft", stage: "warga" },
      { value: "submitted", label: "Submitted", stage: "warga" },
      { value: "under_review", label: "Under Review", stage: "ADMIN" },
      { value: "verified", label: "Verified", stage: "ADMIN" },
      { value: "assigned", label: "Assigned", stage: "PETUGAS" },
      { value: "in_progress", label: "In Progress", stage: "petugas" },
      { value: "needs_survey", label: "Needs Survey", stage: "PETUGAS" },
      { value: "needs_completion", label: "Needs Completion", stage: "warga" },
      {
        value: "pending_clarification",
        label: "Pending Clarification",
        stage: "warga",
      },
      { value: "resolved", label: "Resolved", stage: "system" },
      { value: "closed", label: "Closed", stage: "system" },
      { value: "rejected", label: "Rejected", stage: "ADMIN" },
      { value: "duplicate_merged", label: "Duplicate/Merged", stage: "system" },
      { value: "merged", label: "Merged", stage: "system" },
      { value: "separated", label: "Separated", stage: "system" },
      { value: "escalated", label: "Escalated", stage: "system" },
      { value: "out_of_scope", label: "Out of Scope", stage: "ADMIN" },
    ];
    return c.json({ statuses });
  }),
);

// GET /api/config/priorities
// Returns priority buckets: rendah, sedang, tinggi, kritis with their score ranges
configRoute.get(
  "/priorities",
  safeHandler(async (c) => {
    const priorities = [
      {
        value: "rendah",
        label: "Rendah",
        min_score: 0,
        max_score: 25,
        color: "#22c55e",
      },
      {
        value: "sedang",
        label: "Sedang",
        min_score: 26,
        max_score: 50,
        color: "#eab308",
      },
      {
        value: "tinggi",
        label: "Tinggi",
        min_score: 51,
        max_score: 75,
        color: "#f97316",
      },
      {
        value: "kritis",
        label: "Kritis",
        min_score: 76,
        max_score: 100,
        color: "#ef4444",
      },
    ];
    return c.json({ priorities });
  }),
);

// GET /api/config/sla
// Returns SLA config (default days, warning days)
configRoute.get(
  "/sla",
  safeHandler(async (c) => {
    const config = getConfig(
      c.env as unknown as Record<string, string | undefined>,
    );
    const slaDefaultDays = config.SLA_DEFAULT_DAYS;
    const warningDays = Math.max(1, Math.floor(slaDefaultDays / 2));
    return c.json({
      sla: {
        default_days: slaDefaultDays,
        warning_days: warningDays,
      },
    });
  }),
);

// GET /api/config/categories
// Returns available categories (JALAN, JEMBATAN, etc.) from categories table
configRoute.get(
  "/categories",
  safeHandler(async (c) => {
    const rows = await c.env.D1.prepare(
      `SELECT id, slug, name, icon, short_code, color_class
     FROM categories
     WHERE deleted_at IS NULL
     ORDER BY name`,
    ).all();
    return c.json({ categories: rows.results ?? [] });
  }),
);

// GET /api/config/ai
// Returns AI model name, version, and features from backend configuration
configRoute.get(
  "/ai",
  safeHandler(async (c) => {
    const textModel = c.env.TEXT_MODEL_NAME ?? "MiniMax M3";
    const visionModel = c.env.VISION_MODEL_NAME ?? "MiniMax M3";
    return c.json({
      ai: {
        model_name: visionModel,
        model_version: `${visionModel} v2.3`,
        text_model: textModel,
        vision_model: visionModel,
        provider: "MiniMax",
        features: [
          "vision_analysis",
          "damage_detection",
          "spatial_clustering",
          "authenticity_score",
          "idempotent_assessment",
        ],
      },
    });
  }),
);
