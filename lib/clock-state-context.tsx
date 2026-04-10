/**
 * ClockStateContext — Bulletproof clock state management
 *
 * Architecture: Plain fetch + useState. ZERO TanStack Query involvement.
 *
 * Why plain fetch?
 * TanStack Query has internal caching, stale-time, and background refetch
 * logic that races against optimistic updates and causes the "still shows
 * Clocked In after clock-out" bug regardless of invalidation strategy.
 * Plain fetch is synchronous in intent: we call it, we get a result, we
 * set state. No cache, no background polling, no races.
 *
 * Flow:
 *   1. On mount: fetch active entry from server → set state
 *   2. On Clock In tap: set state to "clocked_in" IMMEDIATELY (optimistic)
 *      then call server in background
 *   3. On Clock Out tap: set state to "clocked_out" IMMEDIATELY (optimistic)
 *      then call server in background
 *   4. AppState "active": re-fetch from server (app came back from background)
 *   5. Every 30s: re-fetch from server (background polling, skipped during mutations)
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAppAuth } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

export interface ActiveClockEntry {
  id: number;
  employeeId: number;
  jobId: number;
  clockIn: string;
  clockOut: string | null;
}

interface ClockStateContextValue {
  activeEntry: ActiveClockEntry | null;
  isLoading: boolean;
  optimisticClockOut: () => void;
  optimisticClockIn: (entry: ActiveClockEntry) => void;
  forceRefresh: () => Promise<void>;
  // Legacy compat — kept so existing clock.tsx code doesn't need changes
  status: "unknown" | "clocked_in" | "clocked_out";
  isMutating: boolean;
  setMutating: (v: boolean) => void;
}

const ClockStateContext = createContext<ClockStateContextValue | null>(null);

async function fetchActiveEntry(employeeId: number): Promise<ActiveClockEntry | null> {
  try {
    const base = getApiBaseUrl();
    const token = await Auth.getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const input = encodeURIComponent(JSON.stringify({ json: { employeeId } }));
    const url = `${base}/api/trpc/clock.activeEntry?input=${input}`;
    const res = await fetch(url, { method: "GET", headers, credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json();
    // tRPC response shape: { result: { data: { json: ... } } }
    const data = json?.result?.data?.json ?? null;
    return data as ActiveClockEntry | null;
  } catch {
    return null;
  }
}

export function ClockStateProvider({ children }: { children: React.ReactNode }) {
  const { employee } = useAppAuth();
  const employeeId = employee?.id;

  const [activeEntry, setActiveEntry] = useState<ActiveClockEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ref: true while a clock mutation is in flight or just completed (10s cooldown)
  // During this window, background fetches do NOT overwrite the optimistic state
  const mutatingRef = useRef(false);
  const mutationCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Core fetch function ─────────────────────────────────────────────────────
  const fetchAndSync = useCallback(async (force = false) => {
    if (!employeeId) return;
    // Skip background fetches while mutating (prevents overwriting optimistic state)
    if (!force && mutatingRef.current) return;
    try {
      const entry = await fetchActiveEntry(employeeId);
      if (!mountedRef.current) return;
      if (force || !mutatingRef.current) {
        setActiveEntry(entry);
        setIsLoading(false);
      }
    } catch {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [employeeId]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!employeeId) return;
    setIsLoading(true);
    fetchAndSync(true);
  }, [employeeId, fetchAndSync]);

  // ── Background polling every 30s (skipped during mutations) ────────────────
  useEffect(() => {
    if (!employeeId) return;
    const interval = setInterval(() => fetchAndSync(false), 30000);
    return () => clearInterval(interval);
  }, [employeeId, fetchAndSync]);

  // ── AppState: force re-fetch when app comes back to foreground ─────────────
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        fetchAndSync(true);
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [fetchAndSync]);

  // ── Optimistic clock-out: update UI INSTANTLY ──────────────────────────────
  const optimisticClockOut = useCallback(() => {
    mutatingRef.current = true;
    setActiveEntry(null);
    setIsLoading(false);
    if (mutationCooldownRef.current) clearTimeout(mutationCooldownRef.current);
    mutationCooldownRef.current = setTimeout(() => {
      mutatingRef.current = false;
    }, 10000);
  }, []);

  // ── Optimistic clock-in: update UI INSTANTLY ──────────────────────────────
  const optimisticClockIn = useCallback((entry: ActiveClockEntry) => {
    mutatingRef.current = true;
    setActiveEntry(entry);
    setIsLoading(false);
    if (mutationCooldownRef.current) clearTimeout(mutationCooldownRef.current);
    mutationCooldownRef.current = setTimeout(() => {
      mutatingRef.current = false;
    }, 10000);
  }, []);

  // ── Force refresh: called after server confirms mutation ───────────────────
  const forceRefresh = useCallback(async () => {
    // End mutation cooldown so server response is authoritative
    mutatingRef.current = false;
    if (mutationCooldownRef.current) {
      clearTimeout(mutationCooldownRef.current);
      mutationCooldownRef.current = null;
    }
    await fetchAndSync(true);
  }, [fetchAndSync]);

  const status = isLoading ? "unknown" : activeEntry ? "clocked_in" : "clocked_out";

  return (
    <ClockStateContext.Provider
      value={{
        activeEntry,
        isLoading,
        optimisticClockOut,
        optimisticClockIn,
        forceRefresh,
        status,
        isMutating: mutatingRef.current,
        setMutating: () => {}, // no-op, kept for legacy compat
      }}
    >
      {children}
    </ClockStateContext.Provider>
  );
}

export function useClockState() {
  const ctx = useContext(ClockStateContext);
  if (!ctx) throw new Error("useClockState must be used within ClockStateProvider");
  return ctx;
}
