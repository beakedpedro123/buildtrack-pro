/**
 * Data Cache — Offline Support
 *
 * Caches critical data (jobs, employees) to AsyncStorage so the app
 * can show data even when offline. Data is refreshed whenever a
 * successful server response is received.
 *
 * v2: Added cache versioning to clear corrupted data from older versions.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "buildtrack_cache_";
const CACHE_VERSION = 2; // Increment this to invalidate all caches
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
      // Clear all cache keys
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

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    if (!versionChecked) await versionCheckPromise;
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    // Reject entries from old cache versions
    if (!entry.version || entry.version < CACHE_VERSION) return null;
    // Validate data is an array if expected (catch corrupted data)
    if (entry.data === null || entry.data === undefined) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    if (!versionChecked) await versionCheckPromise;
    // Don't cache empty/null/undefined data
    if (data === null || data === undefined) return;
    // Don't cache empty arrays
    if (Array.isArray(data) && data.length === 0) return;
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), version: CACHE_VERSION };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Silently fail — caching is best-effort
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

// Cache keys
export const CACHE_KEYS = {
  ACTIVE_JOBS: "active_jobs",
  ALL_EMPLOYEES: "all_employees",
  MY_JOBS: "my_jobs",
  CLOCKED_IN: "all_clocked_in",
  LOGIN_EMPLOYEES: "login_employees",
} as const;
