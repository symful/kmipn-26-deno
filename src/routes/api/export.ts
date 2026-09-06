import { Hono } from "hono";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import type { Env } from "@/types/bindings";
import { buildCsv, buildGeojson, buildPdfExport } from "@/lib/exporters";

import { parseQuery } from "@/lib/validation";
import { ExportReportsQuerySchema } from "@/lib/schemas";
const exportRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

exportRoutes.get(
  "/reports",
  safeHandler(async (c) => {
    const user = c.get("user");
    const { format, ...filters } = parseQuery(c, ExportReportsQuerySchema);
    if (format === "csv") return buildCsv(c.env, filters, user);
    if (format === "geojson") return buildGeojson(c.env, filters, user);
    return buildPdfExport(c.env, filters, user);
  }),
);

export { exportRoutes };
