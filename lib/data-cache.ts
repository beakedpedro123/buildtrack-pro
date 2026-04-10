/**
 * Data Cache — Offline Support
 *
 * Caches critical data (jobs, employees) to AsyncStorage so the app
 * can show data even when offline. Data is refreshed whenever a
 * successful server response is received.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "buildtrack_cache_";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    // Return cached data even if expired (better than nothing when offline)
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Silently fail — caching is best-effort
  }
}

export async function isCacheFresh(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return false;
    const entry = JSON.parse(raw);
    return Date.now() - entry.timestamp < CACHE_TTL;
  } catch {
    return false;
  }
}

// Cache keys
export const CACHE_KEYS = {
  ACTIVE_JOBS: "active_jobs",
  ALL_EMPLOYEES: "all_employees",
  MY_JOBS: "my_jobs",
  CLOCKED_IN: "all_clocked_in",
} as const;
