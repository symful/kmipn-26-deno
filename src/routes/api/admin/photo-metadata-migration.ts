import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireRole } from "@/lib/rbac";
import { type AuthVariables } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";

export const photoMetadataMigrationRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
photoMetadataMigrationRoute.use("*", requireRole("ADMIN"));
photoMetadataMigrationRoute.post(
  "/",
  safeHandler(async (c) => {
    return c.json({
      message: "Legacy v1 migration is no longer supported. All photos use v2 encryption.",
    });
  }),
);
