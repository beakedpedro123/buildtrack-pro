/**
 * ClockStateContext — Bulletproof local-first clock state
 *
 * KEY FIX: Uses a timestamp-based "optimistic lock" instead of a boolean flag.
 * When the user taps Clock In/Out, we record the exact timestamp of the action.
 * Server responses are IGNORED for 8 seconds after a local action.
 * After 8 seconds, the server response is allowed to sync (to confirm or correct).
 *
 * This prevents the race condition where:
 *   1. User taps Clock Out → optimistic state = clocked_out
 *   2. refreshAll() fires → server query re-fetches
 *   3. Server returns the OLD cached "clocked_in" response (network lag)
 *   4. useEffect syncs server state → overwrites optimistic state → UI shows "Clocked In" again
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
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/lib/auth-context";

export type ClockStatus = "unknown" | "clocked_in" | "clocked_out";

export interface ActiveClockEntry {
  id: number;
  employeeId: number;
  jobId: number;
  clockIn: string;
  clockOut: string | null;
  clockInLatitude?: number | null;
  clockInLongitude?: number | null;
}

interface ClockStateContextValue {
  status: ClockStatus;
  activeEntry: ActiveClockEntry | null;
  isMutating: boolean;
  optimisticClockOut: () => void;
  optimisticClockIn: (entry: ActiveClockEntry) => void;
  forceRefresh: () => Promise<void>;
  isLoading: boolean;
  setMutating: (v: boolean) => void;
}

const ClockStateContext = createContext<ClockStateContextValue | null>(null);

// How long (ms) to ignore server responses after a local optimistic action
const OPTIMISTIC_LOCK_MS = 8000;

export function ClockStateProvider({ children }: { children: React.ReactNode }) {
  const { employee } = useAppAuth();
  const employeeId = employee?.id;

  const [status, setStatus] = useState<ClockStatus>("unknown");
  const [activeEntry, setActiveEntry] = useState<ActiveClockEntry | null>(null);
  const [isMutating, setMutating] = useState(false);

  // Timestamp of the last optimistic action — server data is ignored until this expires
  const optimisticLockUntil = useRef<number>(0);

  const utils = trpc.useUtils();

  const { data: serverEntry, isLoading, refetch } = trpc.clock.activeEntry.useQuery(
    { employeeId: employeeId || 0 },
    {
      enabled: !!employeeId,
      staleTime: 0,
      gcTime: 0,
      refetchInterval: 20000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    }
  );

  // Sync server → local state ONLY when the optimistic lock has expired
  useEffect(() => {
    if (isLoading) return;
    const now = Date.now();
    if (now < optimisticLockUntil.current) {
      // Still within lock window — ignore server response, keep optimistic state
      return;
    }

    // Lock expired — server response is authoritative
    if (serverEntry) {
      setActiveEntry(serverEntry as unknown as ActiveClockEntry);
      setStatus("clocked_in");
    } else {
      setActiveEntry(null);
      setStatus("clocked_out");
    }
  }, [serverEntry, isLoading]);

  // AppState listener: re-fetch every time app comes to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        try {
          await utils.clock.activeEntry.invalidate();
          await refetch();
        } catch { /* ignore */ }
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [utils, refetch]);

  const optimisticClockOut = useCallback(() => {
    // Set lock — server responses ignored for OPTIMISTIC_LOCK_MS
    optimisticLockUntil.current = Date.now() + OPTIMISTIC_LOCK_MS;
    setActiveEntry(null);
    setStatus("clocked_out");
  }, []);

  const optimisticClockIn = useCallback((entry: ActiveClockEntry) => {
    // Set lock — server responses ignored for OPTIMISTIC_LOCK_MS
    optimisticLockUntil.current = Date.now() + OPTIMISTIC_LOCK_MS;
    setActiveEntry(entry);
    setStatus("clocked_in");
  }, []);

  const forceRefresh = useCallback(async () => {
    try {
      await utils.clock.activeEntry.invalidate();
      await utils.clock.history.invalidate();
      await utils.clock.allClockedIn.invalidate();
      // Only allow server to sync after the lock expires
      // Schedule the refetch after the lock window
      const remaining = optimisticLockUntil.current - Date.now();
      if (remaining > 0) {
        setTimeout(async () => {
          try { await refetch(); } catch { /* ignore */ }
        }, remaining + 500);
      } else {
        await refetch();
      }
    } catch { /* ignore */ }
  }, [utils, refetch]);

  return (
    <ClockStateContext.Provider
      value={{
        status,
        activeEntry,
        isMutating,
        optimisticClockOut,
        optimisticClockIn,
        forceRefresh,
        isLoading: isLoading && status === "unknown",
        setMutating,
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
