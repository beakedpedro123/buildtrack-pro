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
  notes?: string;
  createdAt: string;
  /** When set, this entry represents a clock-OUT of an existing server entry.
   *  syncPending will call clock.out instead of clock.in for these entries. */
  existingEntryId?: number;
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
const PING_INTERVAL = 15_000;

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
    return true;
  } catch {
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
  const syncingRef = useRef(false);
  const queueRef = useRef<OfflineClockEntry[]>([]);
  const utils = trpc.useUtils();

  // Keep ref in sync with state
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Load queue from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(QUEUE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setQueue(parsed);
          queueRef.current = parsed;
        } catch {}
      }
    });
  }, []);

  const saveQueue = useCallback(async (entries: OfflineClockEntry[]) => {
    setQueue(entries);
    queueRef.current = entries;
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  }, []);

  const addClockEntry = useCallback(async (entry: Omit<OfflineClockEntry, "localId" | "createdAt">) => {
    const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newEntry: OfflineClockEntry = { ...entry, localId, createdAt: new Date().toISOString() };
    const current = queueRef.current;
    const updated = [...current, newEntry];
    await saveQueue(updated);
    return localId;
  }, [saveQueue]);

  const syncPending = useCallback(async () => {
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;
    if (syncingRef.current) return;
    syncingRef.current = true;

    const remaining: OfflineClockEntry[] = [];
    for (const entry of currentQueue) {
      try {
        if (entry.existingEntryId && entry.existingEntryId > 0 && entry.clockOut) {
          // This is a clock-OUT of an existing server entry
          // Call clock.out to close the ORIGINAL entry on the server
          await utils.client.clock.out.mutate({
            entryId: entry.existingEntryId,
            clockOut: entry.clockOut,
          });
        } else {
          // This is a new clock-in (or a complete clock-in + clock-out)
          await utils.client.clock.in.mutate({
            employeeId: entry.employeeId,
            jobId: entry.jobId,
            clockIn: entry.clockIn,
            clockOut: entry.clockOut || undefined,
            isOfflineEntry: true,
            localId: entry.localId,
            notes: entry.notes,
          });
        }
      } catch {
        remaining.push(entry);
      }
    }
    await saveQueue(remaining);
    syncingRef.current = false;

    // After sync, invalidate queries to refresh UI
    if (remaining.length < currentQueue.length) {
      utils.invalidate();
    }
  }, [saveQueue, utils]);

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
        if (previouslyOffline) {
          // Just came back online — sync pending entries
          await syncPending();
          utils.invalidate();
        } else if (queueRef.current.length > 0) {
          // Online but have pending entries (maybe from app restart)
          await syncPending();
        }
      } else {
        wasOfflineRef.current = true;
      }
    };

    check();
    const interval = setInterval(check, PING_INTERVAL);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [syncPending, utils]);

  // Also check on app foreground
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkConnectivity().then((online) => {
          setIsOnline(online);
          if (online) {
            syncPending().catch(() => {});
            utils.invalidate();
          }
        });
      }
    });
    return () => sub.remove();
  }, [syncPending, utils]);

  return (
    <OfflineQueueContext.Provider value={{ pendingCount: queue.length, isOnline, addClockEntry, syncPending }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  return useContext(OfflineQueueContext);
}
