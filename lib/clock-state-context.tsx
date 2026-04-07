/**
 * ClockStateContext — Local-first clock state machine
 *
 * Architecture:
 * - Local state is the source of truth for the UI (instant updates)
 * - Server is queried to hydrate initial state and confirm mutations
 * - On clock-in: local state → "clocked_in" immediately, then server confirms
 * - On clock-out: local state → "clocked_out" immediately, then server confirms
 * - AppState listener: every time app comes to foreground, re-fetch from server
 * - Polling: every 20s while app is active (reduced from 30s)
 * - staleTime: 0 — never consider data fresh, always re-fetch on focus
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
  /** Current clock status — drives all UI */
  status: ClockStatus;
  /** The active clock entry (null if clocked out) */
  activeEntry: ActiveClockEntry | null;
  /** Whether we are currently performing a clock-in or clock-out */
  isMutating: boolean;
  /** Optimistically set clocked-out immediately */
  optimisticClockOut: () => void;
  /** Optimistically set clocked-in immediately */
  optimisticClockIn: (entry: ActiveClockEntry) => void;
  /** Force a server re-fetch */
  forceRefresh: () => Promise<void>;
  /** Whether the initial load is happening */
  isLoading: boolean;
  /** Set mutating flag */
  setMutating: (v: boolean) => void;
}

const ClockStateContext = createContext<ClockStateContextValue | null>(null);

export function ClockStateProvider({ children }: { children: React.ReactNode }) {
  const { employee } = useAppAuth();
  const employeeId = employee?.id;

  const [status, setStatus] = useState<ClockStatus>("unknown");
  const [activeEntry, setActiveEntry] = useState<ActiveClockEntry | null>(null);
  const [isMutating, setMutating] = useState(false);
  const utils = trpc.useUtils();

  // Track if we've done the initial load
  const initialLoadDone = useRef(false);

  // Query with staleTime: 0 so it always re-fetches on invalidate
  const { data: serverEntry, isLoading, refetch } = trpc.clock.activeEntry.useQuery(
    { employeeId: employeeId || 0 },
    {
      enabled: !!employeeId,
      staleTime: 0,          // Never consider stale — always re-fetch
      gcTime: 0,             // Don't cache between navigations
      refetchInterval: 20000, // Poll every 20s
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    }
  );

  // Sync server state → local state (but only when NOT mutating to avoid flicker)
  useEffect(() => {
    if (isLoading) return;
    if (isMutating) return; // Don't overwrite optimistic state during mutation

    initialLoadDone.current = true;

    if (serverEntry) {
      setActiveEntry(serverEntry as unknown as ActiveClockEntry);
      setStatus("clocked_in");
    } else {
      setActiveEntry(null);
      setStatus("clocked_out");
    }
  }, [serverEntry, isLoading, isMutating]);

  // AppState listener: re-fetch every time app comes to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        // App came to foreground — force fresh data from server
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
    // Immediately update local state — UI responds instantly
    setActiveEntry(null);
    setStatus("clocked_out");
  }, []);

  const optimisticClockIn = useCallback((entry: ActiveClockEntry) => {
    // Immediately update local state — UI responds instantly
    setActiveEntry(entry);
    setStatus("clocked_in");
  }, []);

  const forceRefresh = useCallback(async () => {
    try {
      await utils.clock.activeEntry.invalidate();
      await utils.clock.history.invalidate();
      await utils.clock.allClockedIn.invalidate();
      await refetch();
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
        isLoading: isLoading && !initialLoadDone.current,
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
