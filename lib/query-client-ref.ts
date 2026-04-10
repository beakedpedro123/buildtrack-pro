/**
 * Global QueryClient reference — avoids circular imports between _layout.tsx and auth-context.tsx.
 * Set once in _layout.tsx when QueryClient is created.
 * Used in auth-context.tsx to clear cache on logout.
 */
import type { QueryClient } from "@tanstack/react-query";

let _queryClient: QueryClient | null = null;

export function setGlobalQueryClient(qc: QueryClient) {
  _queryClient = qc;
}

export function getGlobalQueryClient(): QueryClient | null {
  return _queryClient;
}
