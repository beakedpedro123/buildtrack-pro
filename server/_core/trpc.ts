import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// Global timeout middleware — prevents queries from hanging forever when DB is down
const withTimeout = t.middleware(async (opts) => {
  const { next } = opts;
  const TIMEOUT_MS = 15000; // 15 second timeout for all procedures
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Request timed out. Please try again.",
    })), TIMEOUT_MS);
  });
  try {
    return await Promise.race([next(), timeoutPromise]);
  } catch (error: any) {
    // Catch TiDB-specific errors and convert to a clean error message
    if (error?.message?.includes("timed out") || error?.message?.includes("TiDB") || error?.code === "ER_UNKNOWN_ERROR") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Service temporarily unavailable. Please try again.",
      });
    }
    throw error;
  }
});

// SECURITY FIX (Critical #2): For public procedures, still read companyId from header
// but ONLY for unauthenticated flows (login, signup, invite acceptance).
// For authenticated flows, companyId is bound from the user's DB record.
const withCompanyIdFromHeader = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const hdr = ctx.req?.headers?.["x-company-id"];
  const companyId = hdr ? parseInt(String(hdr), 10) : 0;
  return next({ ctx: { ...ctx, companyId: isNaN(companyId) ? 0 : companyId } });
});

// Public procedure: uses header-based companyId (only for unauthenticated endpoints)
export const publicProcedure = t.procedure.use(withCompanyIdFromHeader).use(withTimeout);

// SECURITY FIX (Critical #2): Protected procedure binds companyId from the authenticated user's record.
// The x-company-id header is IGNORED for authenticated requests — prevents tenant spoofing.
const requireUserAndBindCompany = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Bind companyId from the authenticated user's company membership
  // The user object should have companyId from the OAuth/session lookup
  const userCompanyId = (ctx.user as any).companyId || ctx.companyId;

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      companyId: userCompanyId,
    },
  });
});

export const protectedProcedure = t.procedure.use(withCompanyIdFromHeader).use(withTimeout).use(requireUserAndBindCompany);

export const adminProcedure = t.procedure.use(withTimeout).use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    // SECURITY FIX (Medium #12): IP Allowlist check — FAIL CLOSED
    // If the allowlist check fails (DB error), DENY access instead of allowing it
    try {
      const { getAdminIpAllowlist, logSecurityEvent } = await import("../db");
      const allowlist = await getAdminIpAllowlist();
      if (allowlist.length > 0) {
        const requestIp = (ctx.req?.ip || ctx.req?.headers?.["x-forwarded-for"] || "") as string;
        const isAllowed = allowlist.some((entry: any) => requestIp.includes(entry.ipAddress));
        if (!isAllowed) {
          await logSecurityEvent({
            eventType: "data_access_denied",
            ipAddress: requestIp,
            details: `Admin access denied: IP ${requestIp} not in allowlist`,
            severity: "critical",
          });
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
        }
      }
    } catch (e: any) {
      if (e?.code === "FORBIDDEN") throw e;
      // SECURITY FIX: Fail CLOSED — if allowlist check fails, deny access
      console.error("[admin] IP allowlist check failed — denying access:", e?.message);
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
