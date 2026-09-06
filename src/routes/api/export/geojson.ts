import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { ExportGeoJsonQuerySchema } from "@/lib/schemas";
import { buildGeojson } from "@/lib/exporters";

export const exportGeojsonRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

exportGeojsonRoute.get(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const filters = parseQuery(c, ExportGeoJsonQuerySchema);
    return buildGeojson(c.env, filters, user);
  }),
);
