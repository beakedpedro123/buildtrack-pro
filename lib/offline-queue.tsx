import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { trpc } from "./trpc";
import { getApiBaseUrl } from "@/constants/oauth";

/* ───────── Clock-specific offline entry ───────── */
export interface OfflineClockEntry {
  localId: string;
  employeeId: number;
  jobId: number;
  clockIn: string;
  clockOut?: string;
  notes?: string;
  createdAt: string;
  existingEntryId?: number;
}

/* ───────── Generic offline mutation entry ───────── */
export type MutationType =
  | "message.send"
  | "goals.update"
  | "changeOrders.create"
  | "budgetAuditLog.create"
  | "budget.addExpense";

export interface OfflineMutation {
  localId: string;
  type: MutationType;
  payload: any;
  createdAt: string;
  retries: number;
}

/* ───────── Context type ───────── */
interface OfflineQueueContextType {
  pendingCount: number;
  isOnline: boolean;
  addClockEntry: (entry: Omit<OfflineClockEntry, "localId" | "createdAt">) => Promise<string>;
  addMutation: (type: MutationType, payload: any) => Promise<string>;
  syncPending: () => Promise<void>;
  lastSyncTime: number | null;
}

const OfflineQueueContext = createContext<OfflineQueueContextType>({
  pendingCount: 0,
  isOnline: true,
  addClockEntry: async () => "",
  addMutation: async () => "",
  syncPending: async () => {},
  lastSyncTime: null,
});

const CLOCK_QUEUE_KEY = "buildtrack_offline_queue";
const MUTATION_QUEUE_KEY = "buildtrack_mutation_queue";
const LAST_SYNC_KEY = "buildtrack_last_sync";
const PING_INTERVAL = 15_000;
const MAX_RETRIES = 5;

async function checkConnectivity(): Promise<boolean> {
  try {
    const base = getApiBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/api/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (res.ok) return true;
  } catch {}
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }
  try {
    const base = getApiBaseUrl();
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 6000);
    await fetch(`${base}/api/trpc`, { method: "HEAD", signal: controller2.signal });
    clearTimeout(timer2);
    return true;
  } catch {}
  if (typeof navigator !== "undefined" && navigator.onLine) {
    return true;
  }
  return false;
}

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [clockQueue, setClockQueue] = useState<OfflineClockEntry[]>([]);
  const [mutationQueue, setMutationQueue] = useState<OfflineMutation[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const wasOfflineRef = useRef(false);
  const syncingRef = useRef(false);
  const clockQueueRef = useRef<OfflineClockEntry[]>([]);
  const mutationQueueRef = useRef<OfflineMutation[]>([]);
  const utils = trpc.useUtils();

  useEffect(() => { clockQueueRef.current = clockQueue; }, [clockQueue]);
  useEffect(() => { mutationQueueRef.current = mutationQueue; }, [mutationQueue]);

  // Load queues from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(CLOCK_QUEUE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setClockQueue(parsed);
          clockQueueRef.current = parsed;
        } catch {}
      }
    });
    AsyncStorage.getItem(MUTATION_QUEUE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setMutationQueue(parsed);
          mutationQueueRef.current = parsed;
        } catch {}
      }
    });
    AsyncStorage.getItem(LAST_SYNC_KEY).then((raw) => {
      if (raw) setLastSyncTime(parseInt(raw, 10));
    });
  }, []);

  const saveClockQueue = useCallback(async (entries: OfflineClockEntry[]) => {
    setClockQueue(entries);
    clockQueueRef.current = entries;
    await AsyncStorage.setItem(CLOCK_QUEUE_KEY, JSON.stringify(entries));
  }, []);

  const saveMutationQueue = useCallback(async (entries: OfflineMutation[]) => {
    setMutationQueue(entries);
    mutationQueueRef.current = entries;
    await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(entries));
  }, []);

  const addClockEntry = useCallback(async (entry: Omit<OfflineClockEntry, "localId" | "createdAt">) => {
    const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newEntry: OfflineClockEntry = { ...entry, localId, createdAt: new Date().toISOString() };
    const updated = [...clockQueueRef.current, newEntry];
    await saveClockQueue(updated);
    return localId;
  }, [saveClockQueue]);

  const addMutation = useCallback(async (type: MutationType, payload: any) => {
    const localId = `mut_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newEntry: OfflineMutation = { localId, type, payload, createdAt: new Date().toISOString(), retries: 0 };
    const updated = [...mutationQueueRef.current, newEntry];
    await saveMutationQueue(updated);
    return localId;
  }, [saveMutationQueue]);

  /* ───────── Execute a single generic mutation ───────── */
  const executeMutation = useCallback(async (entry: OfflineMutation): Promise<boolean> => {
    try {
      switch (entry.type) {
        case "message.send":
          await utils.client.messages.send.mutate(entry.payload);
          break;
        case "goals.update":
          await utils.client.goals.update.mutate(entry.payload);
          break;
        case "changeOrders.create":
          await utils.client.changeOrders.create.mutate(entry.payload);
          break;
        case "budgetAuditLog.create":
          await utils.client.financialCharts.createAuditEntry.mutate(entry.payload);
          break;
        case "budget.addExpense":
          await utils.client.budget.addExpense.mutate(entry.payload);
          break;
        default:
          return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [utils]);

  /* ───────── Sync all pending entries ───────── */
  const syncPending = useCallback(async () => {
    const currentClock = clockQueueRef.current;
    const currentMutations = mutationQueueRef.current;
    if (currentClock.length === 0 && currentMutations.length === 0) return;
    if (syncingRef.current) return;
    syncingRef.current = true;

    // Sync clock entries
    const remainingClock: OfflineClockEntry[] = [];
    for (const entry of currentClock) {
      try {
        if (entry.existingEntryId && entry.existingEntryId > 0 && entry.clockOut) {
          await utils.client.clock.out.mutate({
            entryId: entry.existingEntryId,
            clockOut: entry.clockOut,
          });
        } else {
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
        remainingClock.push(entry);
      }
    }
    await saveClockQueue(remainingClock);

    // Sync generic mutations
    const remainingMutations: OfflineMutation[] = [];
    for (const entry of currentMutations) {
      const success = await executeMutation(entry);
      if (!success) {
        if (entry.retries < MAX_RETRIES) {
          remainingMutations.push({ ...entry, retries: entry.retries + 1 });
        }
        // Drop entries that exceeded MAX_RETRIES
      }
    }
    await saveMutationQueue(remainingMutations);

    syncingRef.current = false;

    // Record sync time
    const now = Date.now();
    setLastSyncTime(now);
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(now));

    // After sync, invalidate queries to refresh UI
    const synced = (currentClock.length - remainingClock.length) + (currentMutations.length - remainingMutations.length);
    if (synced > 0) {
      utils.invalidate();
    }
  }, [saveClockQueue, saveMutationQueue, executeMutation, utils]);

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
          await syncPending();
          utils.invalidate();
        } else if (clockQueueRef.current.length > 0 || mutationQueueRef.current.length > 0) {
          await syncPending();
        }
      } else {
        wasOfflineRef.current = true;
      }
    };
    check();
    const interval = setInterval(check, PING_INTERVAL);
    return () => { mounted = false; clearInterval(interval); };
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

  const totalPending = clockQueue.length + mutationQueue.length;

  return (
    <OfflineQueueContext.Provider value={{
      pendingCount: totalPending,
      isOnline,
      addClockEntry,
      addMutation,
      syncPending,
      lastSyncTime,
    }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  return useContext(OfflineQueueContext);
}
