import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { safeHandler } from "@/lib/safeHandler";

export const publicHealthRoute = new Hono<{ Bindings: Env }>();

publicHealthRoute.get(
  "/",
  safeHandler(async (c) => {
    return c.json({ status: "ok" });
  }),
);
