import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import type { AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { integrationStatus } from "@/lib/integrations";

export const integrationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
integrationsRoute.get(
  "/",
  safeHandler(async (c) => {
    const connectors = integrationStatus(c.env);
    const count = await c.env.D1.prepare(
      "SELECT COUNT(*) AS total FROM reports WHERE merged_into IS NULL AND status NOT IN ('draft', 'rejected', 'out_of_scope')",
    ).first<{ total: number }>();
    return c.json({
      connectors,
      configured_count: connectors.filter((item) => item.configured).length,
      available_count: 0,
      record_count: count?.total ?? 0,
    });
  }),
);
integrationsRoute.post(
  "/sync",
  safeHandler(async (c) =>
    c.json(
      {
        error: {
          code: "INTEGRATIONS_UNAVAILABLE",
          message:
            "Sinkronisasi belum tersedia: konektor pemerintah belum memiliki konfigurasi dan adaptor pengiriman yang aktif. Gunakan ekspor GeoJSON, CSV, atau PDF.",
        },
        connectors: integrationStatus(c.env),
      },
      409,
    ),
  ),
);
