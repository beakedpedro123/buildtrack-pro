/**
 * ClockStateContext — Bulletproof clock state management with offline support
 *
 * Architecture: Plain fetch + useState + AsyncStorage persistence.
 *
 * Key offline behaviors:
 *   - Optimistic state is persisted to AsyncStorage so it survives app restarts
 *   - Background polling skips when offline (no wasted fetch attempts)
 *   - When offline, the optimistic state is NEVER overwritten by failed fetches
 *   - When back online, forceRefresh re-syncs with server
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppAuth } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

const CLOCK_STATE_KEY = "buildtrack_clock_state";

export interface ActiveClockEntry {
  id: number;
  employeeId: number;
  jobId: number;
  clockIn: string;
  clockOut: string | null;
  lunchMinutes?: number;
  lunchStartedAt?: string | null;
}

interface ClockStateContextValue {
  activeEntry: ActiveClockEntry | null;
  isLoading: boolean;
  optimisticClockOut: () => void;
  optimisticClockIn: (entry: ActiveClockEntry) => void;
  forceRefresh: () => Promise<void>;
  // Legacy compat
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: "GET", headers, credentials: "include", signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.result?.data?.json ?? null;
    return data as ActiveClockEntry | null;
  } catch {
    return null;
  }
}

/** Persist active entry to AsyncStorage for offline resilience */
async function persistClockState(entry: ActiveClockEntry | null) {
  try {
    if (entry) {
      await AsyncStorage.setItem(CLOCK_STATE_KEY, JSON.stringify(entry));
    } else {
      await AsyncStorage.removeItem(CLOCK_STATE_KEY);
    }
  } catch {}
}

/** Load persisted clock state from AsyncStorage */
async function loadPersistedClockState(): Promise<ActiveClockEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CLOCK_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveClockEntry;
  } catch {
    return null;
  }
}

export function ClockStateProvider({ children }: { children: React.ReactNode }) {
  const { employee } = useAppAuth();
  const employeeId = employee?.id;

  const [activeEntry, setActiveEntry] = useState<ActiveClockEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const mutatingRef = useRef(false);
  const mutationCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const isOnlineRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load persisted state on mount (for offline resilience)
  useEffect(() => {
    if (!employeeId) return;
    loadPersistedClockState().then((persisted) => {
      if (mountedRef.current && persisted && persisted.employeeId === employeeId) {
        setActiveEntry(persisted);
        setIsLoading(false);
      }
    });
  }, [employeeId]);

  // Smart fetch that distinguishes network failure from "no active entry"
  const smartFetch = useCallback(async (force = false) => {
    if (!employeeId) return;
    if (!force && mutatingRef.current) return;
    try {
      const base = getApiBaseUrl();
      const token = await Auth.getSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const input = encodeURIComponent(JSON.stringify({ json: { employeeId } }));
      const url = `${base}/api/trpc/clock.activeEntry?input=${input}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { method: "GET", headers, credentials: "include", signal: controller.signal });
      clearTimeout(timer);

      if (!mountedRef.current) return;

      if (res.ok) {
        // Server responded — this is authoritative
        isOnlineRef.current = true;
        const json = await res.json();
        const data = (json?.result?.data?.json ?? null) as ActiveClockEntry | null;
        if (force || !mutatingRef.current) {
          setActiveEntry(data);
          persistClockState(data);
          setIsLoading(false);
        }
      } else {
        // Server error but reachable
        isOnlineRef.current = true;
        if (mountedRef.current) setIsLoading(false);
      }
    } catch {
      // Network error — we're offline. KEEP current state.
      isOnlineRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, [employeeId]);

  // Initial load
  useEffect(() => {
    if (!employeeId) return;
    setIsLoading(true);
    smartFetch(true);
  }, [employeeId, smartFetch]);

  // Background polling every 30s — only when online
  useEffect(() => {
    if (!employeeId) return;
    const interval = setInterval(() => {
      if (isOnlineRef.current) {
        smartFetch(false);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [employeeId, smartFetch]);

  // AppState: force re-fetch when app comes back to foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        smartFetch(true);
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [smartFetch]);

  // Optimistic clock-out: update UI INSTANTLY + persist
  const optimisticClockOut = useCallback(() => {
    mutatingRef.current = true;
    setActiveEntry(null);
    persistClockState(null);
    setIsLoading(false);
    if (mutationCooldownRef.current) clearTimeout(mutationCooldownRef.current);
    mutationCooldownRef.current = setTimeout(() => {
      mutatingRef.current = false;
    }, 15000); // 15s cooldown to prevent background fetch from overwriting
  }, []);

  // Optimistic clock-in: update UI INSTANTLY + persist
  const optimisticClockIn = useCallback((entry: ActiveClockEntry) => {
    mutatingRef.current = true;
    setActiveEntry(entry);
    persistClockState(entry);
    setIsLoading(false);
    if (mutationCooldownRef.current) clearTimeout(mutationCooldownRef.current);
    mutationCooldownRef.current = setTimeout(() => {
      mutatingRef.current = false;
    }, 15000);
  }, []);

  // Force refresh: called after server confirms mutation
  const forceRefresh = useCallback(async () => {
    mutatingRef.current = false;
    if (mutationCooldownRef.current) {
      clearTimeout(mutationCooldownRef.current);
      mutationCooldownRef.current = null;
    }
    await smartFetch(true);
  }, [smartFetch]);

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
        setMutating: () => {},
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
