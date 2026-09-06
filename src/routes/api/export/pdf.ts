import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { parseQuery } from "@/lib/validation";
import { ExportPdfQuerySchema } from "@/lib/schemas";
import { buildPdfExport } from "@/lib/exporters";

export const exportPdfRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

exportPdfRoute.get(
  "/",
  safeHandler(async (c) => {
    const user = c.get("user");
    const {
      report_id,
      status,
      category_id: categoryId,
      from,
      to,
    } = parseQuery(c, ExportPdfQuerySchema);
    return buildPdfExport(
      c.env,
      { report_id, status, category_id: categoryId, from, to },
      user,
    );
  }),
);
