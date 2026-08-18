import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { pingDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { safeHandler } from "@/lib/safeHandler";

export const publicHealthRoute = new Hono<{ Bindings: Env }>();

publicHealthRoute.get(
  "/",
  safeHandler(async (c) => {
    const db = await pingDb(c.env);
    let llm = false;
    try {
      const res = await fetch(`${c.env.LLM_API_URI}/models`, {
        headers: { Authorization: `Bearer ${c.env.LLM_API_KEY}` },
        signal: AbortSignal.timeout(3000),
      });
      llm = res.ok;
    } catch (e) { logger.warn({ route: "/public/health", method: "GET", context: "llm_health_check_failed", error: e instanceof Error ? e : new Error(String(e)) }); }
    let r2 = false;
    try {
      await c.env.R2.head("__health_check__");
      r2 = true;
    } catch (e) { logger.warn({ route: "/public/health", method: "GET", context: "r2_health_check_failed", error: e instanceof Error ? e : new Error(String(e)) }); }
    let kv = false;
    if (c.env.RATE_LIMITER) {
      try {
        await Promise.race([
          c.env.RATE_LIMITER.get("__health_check__"),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("KV timeout")), 3000)),
        ]);
        kv = true;
      } catch (e) { logger.warn({ route: "/public/health", method: "GET", context: "kv_health_check_failed", error: e instanceof Error ? e : new Error(String(e)) }); }
    }
    return c.json({ status: db && llm && r2 && kv ? "ok" : "degraded", db, llm, r2, kv });
  }),
);
