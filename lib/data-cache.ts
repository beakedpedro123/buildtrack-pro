/**
 * Data Cache — Offline Support (Multi-Tenant Safe)
 *
 * Caches critical data (jobs, employees) to AsyncStorage so the app
 * can show data even when offline. Data is refreshed whenever a
 * successful server response is received.
 *
 * v5: Company-scoped cache keys — prevents cross-company data leaks.
 *     Each company's data is stored under a unique prefix.
 *     Caches are cleared on logout/company switch.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "buildtrack_cache_";
const CACHE_VERSION = 5; // v5: company-scoped keys, force clear all old caches
const CACHE_VERSION_KEY = "buildtrack_cache_version";
const ACTIVE_COMPANY_KEY = "buildtrack_active_company";

// Current company ID for scoping cache keys
let _activeCompanyId: number | null = null;

/** Set the active company for cache scoping — call on login */
export function setCacheCompanyId(companyId: number): void {
  _activeCompanyId = companyId;
}

/** Get the active company ID */
export function getCacheCompanyId(): number | null {
  return _activeCompanyId;
}

/** Build a company-scoped cache key */
function scopedKey(key: string): string {
  const cid = _activeCompanyId || 0;
  return `${CACHE_PREFIX}c${cid}_${key}`;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
  companyId: number;
}

/** Clear all old caches when version changes */
async function ensureCacheVersion(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(CACHE_VERSION_KEY);
    const storedVersion = stored ? parseInt(stored, 10) : 0;
    if (storedVersion < CACHE_VERSION) {
      // Clear ALL caches from all companies on version bump
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
    const fullKey = scopedKey(key);
    const raw = await AsyncStorage.getItem(fullKey);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    // Reject entries from old cache versions
    if (!entry.version || entry.version < CACHE_VERSION) return null;
    // Reject entries from a different company (extra safety)
    if (entry.companyId && _activeCompanyId && entry.companyId !== _activeCompanyId) {
      await AsyncStorage.removeItem(fullKey);
      return null;
    }
    if (entry.data === null || entry.data === undefined) return null;
    // Validate job arrays on read
    if (Array.isArray(entry.data) && (key === CACHE_KEYS.ACTIVE_JOBS || key === CACHE_KEYS.MY_JOBS)) {
      if (!isValidJobArray(entry.data)) {
        // Corrupted — remove it
        await AsyncStorage.removeItem(fullKey);
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
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      companyId: _activeCompanyId || 0,
    };
    await AsyncStorage.setItem(scopedKey(key), JSON.stringify(entry));
  } catch {
    // Silently fail
  }
}

export async function isCacheFresh(key: string, ttlMs = 24 * 60 * 60 * 1000): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(key));
    if (!raw) return false;
    const entry = JSON.parse(raw);
    if (!entry.version || entry.version < CACHE_VERSION) return false;
    if (entry.companyId && _activeCompanyId && entry.companyId !== _activeCompanyId) return false;
    return Date.now() - entry.timestamp < ttlMs;
  } catch {
    return false;
  }
}

/** Force clear all caches for ALL companies — use on logout or data corruption */
export async function clearAllCaches(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {}
}

/** Clear caches only for the current company */
export async function clearCompanyCaches(): Promise<void> {
  try {
    const prefix = `${CACHE_PREFIX}c${_activeCompanyId || 0}_`;
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(prefix));
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
  RECENT_REPORTS: "recent_reports",
  GOALS: "goals",
  MEETINGS: "meetings",
  ALL_JOBS: "all_jobs",
  KPI_METRICS: "kpi_metrics",
  PUNCH_LIST: "punch_list",
  // Phase 92: Comprehensive offline caching
  MESSAGES: "messages",
  MESSAGES_CONVERSATIONS: "messages_conversations",
  HOURS_ENTRIES: "hours_entries",
  PAYROLL_DATA: "payroll_data",
  LABOR_DASHBOARD: "labor_dashboard",
  LABOR_BY_JOB: "labor_by_job",
  LABOR_BY_EMPLOYEE: "labor_by_employee",
  CHART_PROFITABILITY: "chart_profitability",
  CHART_LABOR_TRENDS: "chart_labor_trends",
  CHART_TAX_BREAKDOWN: "chart_tax_breakdown",
  SAFETY_TALKS: "safety_talks",
  PROFILE_DATA: "profile_data",
  BUDGET_ALERTS: "budget_alerts",
  CHANGE_ORDERS: "change_orders",
  BUDGET_AUDIT_LOG: "budget_audit_log",
  // Phase 106: Offline cache for remaining tabs
  CLOCK_STATUS: "clock_status",
  CLOCK_ENTRIES: "clock_entries",
  SCHEDULE_ALL: "schedule_all",
  TEAM_EMPLOYEES: "team_employees",
  MEETINGS_LIST: "meetings_list",
  REPORTS_LIST: "reports_list",
  JOBS_LIST: "jobs_list",
  GOALS_LIST: "goals_list",
  // Phase 130: Lunch settings offline cache
  LUNCH_SETTINGS: "lunch_settings",
} as const;
