import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  companyId: number;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // SECURITY FIX: Default companyId to 0 (not 1) when no header present.
  // For authenticated users, the trpc middleware will override this with the user's actual companyId.
  const hdr = opts.req.headers["x-company-id"];
  const companyId = hdr ? parseInt(String(hdr), 10) : 0;

  return {
    req: opts.req,
    res: opts.res,
    user,
    companyId: isNaN(companyId) ? 0 : companyId,
  };
}
