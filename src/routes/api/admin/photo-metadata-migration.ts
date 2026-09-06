import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireRole } from "@/lib/rbac";
import { type AuthVariables } from "@/lib/auth";
import { migratePhotoMetadataBatch } from "@/lib/photoMetadata";
import { safeHandler } from "@/lib/safeHandler";
import { parseJson } from "@/lib/validation";
import { z } from "zod";
export const photoMetadataMigrationRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
photoMetadataMigrationRoute.use("*", requireRole("ADMIN"));
photoMetadataMigrationRoute.post(
  "/",
  safeHandler(async (c) => {
    if (!c.env.PHOTO_EVIDENCE_SECRET || !c.env.LEGACY_PHOTO_EVIDENCE_SECRET)
      return c.json(
        {
          error: {
            code: "MIGRATION_UNAVAILABLE",
            message: "Konfigurasi migrasi metadata belum tersedia.",
          },
        },
        503,
      );
    const { cursor } = await parseJson(
      c,
      z.object({ cursor: z.string().max(2048).optional() }),
    );
    return c.json(await migratePhotoMetadataBatch(c.env, cursor));
  }),
);
