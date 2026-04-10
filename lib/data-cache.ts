/**
 * Data Cache — Offline Support
 *
 * Caches critical data (jobs, employees) to AsyncStorage so the app
 * can show data even when offline. Data is refreshed whenever a
 * successful server response is received.
 *
 * v4: Aggressive validation — checks EVERY item in job arrays, not just first.
 *     Force clears all old caches on version bump.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "buildtrack_cache_";
const CACHE_VERSION = 4; // v4: validate ALL items, force clear
const CACHE_VERSION_KEY = "buildtrack_cache_version";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

/** Clear all old caches when version changes */
async function ensureCacheVersion(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(CACHE_VERSION_KEY);
    const storedVersion = stored ? parseInt(stored, 10) : 0;
    if (storedVersion < CACHE_VERSION) {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
      await AsyncStorage.setItem(CACHE_VERSION_KEY, String(CACHE_VERSION));
    }
  } catch {
    // Best effort
  }
}

// Run version check on module load
let versionChecked = false;
const versionCheckPromise = ensureCacheVersion().then(() => { versionChecked = true; });

/** Validate that a job array has proper objects with name fields */
function isValidJobArray(data: any[]): boolean {
  if (data.length === 0) return false;
  // Check EVERY item, not just the first
  for (const item of data) {
    if (!item || typeof item !== "object") return false;
    if (!item.name || typeof item.name !== "string" || item.name.length < 2) return false;
    if (typeof item.id !== "number") return false;
  }
  return true;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    if (!versionChecked) await versionCheckPromise;
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    // Reject entries from old cache versions
    if (!entry.version || entry.version < CACHE_VERSION) return null;
    if (entry.data === null || entry.data === undefined) return null;
    // Validate job arrays on read
    if (Array.isArray(entry.data) && (key === CACHE_KEYS.ACTIVE_JOBS || key === CACHE_KEYS.MY_JOBS)) {
      if (!isValidJobArray(entry.data)) {
        // Corrupted — remove it
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    if (!versionChecked) await versionCheckPromise;
    if (data === null || data === undefined) return;
    if (Array.isArray(data) && data.length === 0) return;
    // Validate job arrays before caching
    if (Array.isArray(data) && (key === CACHE_KEYS.ACTIVE_JOBS || key === CACHE_KEYS.MY_JOBS)) {
      if (!isValidJobArray(data)) {
        // Don't cache corrupted data
        return;
      }
    }
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), version: CACHE_VERSION };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Silently fail
  }
}

export async function isCacheFresh(key: string, ttlMs = 24 * 60 * 60 * 1000): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return false;
    const entry = JSON.parse(raw);
    if (!entry.version || entry.version < CACHE_VERSION) return false;
    return Date.now() - entry.timestamp < ttlMs;
  } catch {
    return false;
  }
}

/** Force clear all caches — use when data is known to be corrupted */
export async function clearAllCaches(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {}
}

export const CACHE_KEYS = {
  ACTIVE_JOBS: "active_jobs",
  ALL_EMPLOYEES: "all_employees",
  MY_JOBS: "my_jobs",
  CLOCKED_IN: "all_clocked_in",
  LOGIN_EMPLOYEES: "login_employees",
} as const;
