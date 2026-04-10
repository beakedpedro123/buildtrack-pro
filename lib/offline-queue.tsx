import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { trpc } from "./trpc";
import { getApiBaseUrl } from "@/constants/oauth";

export interface OfflineClockEntry {
  localId: string;
  employeeId: number;
  jobId: number;
  clockIn: string;
  clockOut?: string;
  clockInLatitude?: number;
  clockInLongitude?: number;
  clockOutLatitude?: number;
  clockOutLongitude?: number;
  notes?: string;
  createdAt: string;
}

interface OfflineQueueContextType {
  pendingCount: number;
  isOnline: boolean;
  addClockEntry: (entry: Omit<OfflineClockEntry, "localId" | "createdAt">) => Promise<string>;
  syncPending: () => Promise<void>;
}

const OfflineQueueContext = createContext<OfflineQueueContextType>({
  pendingCount: 0,
  isOnline: true,
  addClockEntry: async () => "",
  syncPending: async () => {},
});

const QUEUE_KEY = "buildtrack_offline_queue";
const PING_INTERVAL = 15_000; // Check connectivity every 15s

/**
 * Lightweight connectivity check — pings the API server.
 * Uses a HEAD request with a short timeout.
 */
async function checkConnectivity(): Promise<boolean> {
  try {
    const base = getApiBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/api/trpc`, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Any response (even 4xx) means the server is reachable
    return true;
  } catch {
    // On web, also check navigator.onLine as a fallback
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      return navigator.onLine;
    }
    return false;
  }
}

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<OfflineClockEntry[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const wasOfflineRef = useRef(false);
  const utils = trpc.useUtils();

  // Load queue from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(QUEUE_KEY).then((raw) => {
      if (raw) {
        try { setQueue(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const saveQueue = useCallback(async (entries: OfflineClockEntry[]) => {
    setQueue(entries);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  }, []);

  const addClockEntry = useCallback(async (entry: Omit<OfflineClockEntry, "localId" | "createdAt">) => {
    const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newEntry: OfflineClockEntry = { ...entry, localId, createdAt: new Date().toISOString() };
    const updated = [...queue, newEntry];
    await saveQueue(updated);
    return localId;
  }, [queue, saveQueue]);

  const syncPending = useCallback(async () => {
    if (queue.length === 0) return;
    const remaining: OfflineClockEntry[] = [];
    for (const entry of queue) {
      try {
        await utils.client.clock.in.mutate({
          employeeId: entry.employeeId,
          jobId: entry.jobId,
          clockIn: entry.clockIn,
          clockInLatitude: entry.clockInLatitude,
          clockInLongitude: entry.clockInLongitude,
          isOfflineEntry: true,
          localId: entry.localId,
          notes: entry.notes,
        });
      } catch {
        remaining.push(entry);
      }
    }
    await saveQueue(remaining);
  }, [queue, saveQueue, utils]);

  // Periodic connectivity check
  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const online = await checkConnectivity();
      if (!mounted) return;

      const previouslyOffline = wasOfflineRef.current;
      setIsOnline(online);

      if (online) {
        wasOfflineRef.current = false;
        // If we just came back online, sync pending entries and invalidate queries
        if (previouslyOffline) {
          syncPending().catch(() => {});
          // Invalidate all queries so they refetch fresh data
          utils.invalidate();
        }
      } else {
        wasOfflineRef.current = true;
      }
    };

    // Initial check
    check();

    // Periodic check
    const interval = setInterval(check, PING_INTERVAL);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [syncPending, utils]);

  // Also check on app foreground (native only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkConnectivity().then((online) => {
          setIsOnline(online);
          if (online && queue.length > 0) {
            syncPending().catch(() => {});
          }
          if (online) {
            utils.invalidate();
          }
        });
      }
    });
    return () => sub.remove();
  }, [queue, syncPending, utils]);

  return (
    <OfflineQueueContext.Provider value={{ pendingCount: queue.length, isOnline, addClockEntry, syncPending }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  return useContext(OfflineQueueContext);
}
