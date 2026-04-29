import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// Global timeout middleware — prevents queries from hanging forever when DB is down
// Extract companyId from x-company-id header for multi-tenant isolation
const withCompanyId = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const hdr = ctx.req?.headers?.["x-company-id"];
  const companyId = hdr ? parseInt(String(hdr), 10) : 1;
  return next({ ctx: { ...ctx, companyId: isNaN(companyId) ? 1 : companyId } });
});

const withTimeout = t.middleware(async (opts) => {
  const { next } = opts;
  const TIMEOUT_MS = 15000; // 15 second timeout for all procedures
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Request timed out — database may be temporarily unavailable. Please try again.",
    })), TIMEOUT_MS);
  });
  try {
    return await Promise.race([next(), timeoutPromise]);
  } catch (error: any) {
    // Catch TiDB-specific errors and convert to a clean error message
    if (error?.message?.includes("timed out") || error?.message?.includes("TiDB") || error?.code === "ER_UNKNOWN_ERROR") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database temporarily unavailable. The app will use cached data.",
      });
    }
    throw error;
  }
});

export const publicProcedure = t.procedure.use(withCompanyId).use(withTimeout);

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(withCompanyId).use(withTimeout).use(requireUser);

export const adminProcedure = t.procedure.use(withTimeout).use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
