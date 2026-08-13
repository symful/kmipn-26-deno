import type { MiddlewareHandler } from "hono";
import type { Env } from "@/types/bindings";

/**
 * Module-level KV namespace singleton for distributed rate limiting.
 * Set by rateLimit middleware before route handlers execute.
 */
let rateLimiterKV: KVNamespace | undefined;

function setRateLimiterKV(kv: KVNamespace | undefined) {
  rateLimiterKV = kv;
}

function getRateLimiterKV(): KVNamespace | undefined {
  return rateLimiterKV;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fallback for local development
const memoryBuckets = new Map<string, Bucket>();

function checkRateLimitMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) {
    return false;
  }
  existing.count += 1;
  return true;
}

async function checkRateLimitKV(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowKey = `${windowStart}:${key}`;
  const windowSec = Math.ceil(windowMs / 1000);
  const ttl = windowSec + 60;

  const raw = await kv.get(windowKey, "text");
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= limit) {
    return false;
  }

  await kv.put(windowKey, String(count + 1), { expirationTtl: ttl });
  return true;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const kv = getRateLimiterKV();
  if (kv) {
    return checkRateLimitKV(kv, key, limit, windowMs);
  }
  return checkRateLimitMemory(key, limit, windowMs);
}

export async function checkRateLimitByDevice(
  deviceId: string,
  endpoint: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  const key = `${deviceId}:${endpoint}`;
  return checkRateLimit(key, limit, windowSec * 1000);
}

export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  keyBy?: (c: { req: { header: (n: string) => string | undefined }; env: Env }) => string;
}): MiddlewareHandler<{ Bindings: Env }> {
  const { limit, windowMs, keyBy } = opts;
  return async (c, next) => {
    if (c.env.ENVIRONMENT === "development" && c.env.RATE_LIMIT_BYPASS === "true") {
      return await next();
    }
    setRateLimiterKV(c.env.RATE_LIMITER);
    const k = keyBy ? keyBy(c) : (c.req.header("x-forwarded-for") ?? "anonymous");
    const allowed = await checkRateLimit(k, limit, windowMs);
    if (!allowed) {
      c.header("Retry-After", String(Math.ceil(windowMs / 1000)));
      return c.json({ error: "rate_limited" }, 429);
    }
    return await next();
  };
}
