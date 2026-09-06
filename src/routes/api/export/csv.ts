import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { ExportCsvQuerySchema } from "@/lib/schemas";
import { buildCsv } from "@/lib/exporters";

export const exportCsvRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

exportCsvRoute.get(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const filters = parseQuery(c, ExportCsvQuerySchema);
    return buildCsv(c.env, filters, user);
  }),
);
