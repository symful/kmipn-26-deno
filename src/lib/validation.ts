import type { Context } from "hono";
import { z } from "zod";

export class BodyError extends Error {
  constructor(public zodErr: z.ZodError) {
    super("VALIDATION_ERROR");
    this.name = "BodyError";
  }
}

export async function parseJson<T>(
  c: Context,
  s: z.ZodType<T, any, any>,
): Promise<T> {
  const body = await c.req.json().catch(() => ({}));
  const parsed = s.safeParse(body);
  if (!parsed.success) throw new BodyError(parsed.error);
  return parsed.data;
}

export function parseQuery<S extends z.ZodTypeAny>(
  c: Context,
  s: S,
): z.output<S> {
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.req.queries())) {
    const last = v[v.length - 1];
    if (last !== undefined) raw[k] = last;
  }
  const parsed = s.safeParse(raw);
  if (!parsed.success) throw new BodyError(parsed.error);
  return parsed.data;
}
