import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { trpc } from "./trpc";

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

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<OfflineClockEntry[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const utils = trpc.useUtils();

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

  // Attempt sync when app comes to foreground
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && queue.length > 0) {
        syncPending().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [queue, syncPending]);

  return (
    <OfflineQueueContext.Provider value={{ pendingCount: queue.length, isOnline, addClockEntry, syncPending }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  return useContext(OfflineQueueContext);
}
