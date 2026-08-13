import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth, type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/middleware/roles";
import { safeHandler } from "@/lib/safeHandler";
import { verifyAuditChain } from "@/lib/audit";

export const auditVerifyChainRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

auditVerifyChainRoute.get(
  "/",
  requireAuth,
  requireRole("AUDITOR", "ADMIN"),
  safeHandler(async (c) => {
    const result = await verifyAuditChain(c.env);
    return c.json(result);
  }),
);
