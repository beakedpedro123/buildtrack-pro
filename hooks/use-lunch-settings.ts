/**
 * useLunchSettings — Company-level lunch/break deduction settings
 *
 * Now syncs with the server (company.getLunchSettings / company.updateLunchSettings).
 * Falls back to AsyncStorage for offline use.
 * Also supports per-entry lunchMinutes from the DB.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";

const LUNCH_SETTINGS_KEY = "buildtrack_lunch_settings";

export interface LunchSettings {
  enabled: boolean;
  deductMinutes: number; // default 30
  minShiftMinutes: number; // minimum shift length to qualify (default 360 = 6hrs)
  skipDays: number[]; // days of week to skip (0=Sun, 1=Mon, ..., 5=Fri, 6=Sat)
}

const DEFAULT_SETTINGS: LunchSettings = {
  enabled: false,
  deductMinutes: 30,
  minShiftMinutes: 360,
  skipDays: [5], // Friday skipped by default (short day, no lunch)
};

export function useLunchSettings() {
  const [settings, setSettings] = useState<LunchSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Fetch from server
  const serverQ = trpc.company.getLunchSettings.useQuery({}, {
    staleTime: 60_000,
    retry: 1,
  });
  const updateMutation = trpc.company.updateLunchSettings.useMutation();

  // When server data arrives, use it and cache locally
  useEffect(() => {
    if (serverQ.data) {
      const serverSettings: LunchSettings = {
        enabled: serverQ.data.enabled,
        deductMinutes: serverQ.data.deductMinutes,
        minShiftMinutes: serverQ.data.minShiftMinutes,
        skipDays: serverQ.data.skipDays,
      };
      setSettings(serverSettings);
      setLoaded(true);
      // Cache locally for offline
      AsyncStorage.setItem(LUNCH_SETTINGS_KEY, JSON.stringify(serverSettings)).catch(() => {});
    }
  }, [serverQ.data]);

  // If server fails, load from AsyncStorage
  useEffect(() => {
    if (serverQ.isError && !loaded) {
      AsyncStorage.getItem(LUNCH_SETTINGS_KEY)
        .then((val) => {
          if (val) {
            try {
              const parsed = JSON.parse(val);
              setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            } catch {
              setSettings(DEFAULT_SETTINGS);
            }
          }
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }, [serverQ.isError, loaded]);

  // If neither server nor cache, mark loaded after timeout
  useEffect(() => {
    if (!loaded) {
      const timer = setTimeout(() => setLoaded(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [loaded]);

  const updateSettings = useCallback(async (updates: Partial<LunchSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    // Save locally first (instant)
    await AsyncStorage.setItem(LUNCH_SETTINGS_KEY, JSON.stringify(newSettings));
    // Then sync to server
    try {
      await updateMutation.mutateAsync({
        enabled: newSettings.enabled,
        deductMinutes: newSettings.deductMinutes,
        minShiftMinutes: newSettings.minShiftMinutes,
        skipDays: newSettings.skipDays,
      });
    } catch {
      // Server sync failed — local settings still saved
    }
  }, [settings, updateMutation]);

  const calcDeduction = useCallback((dayOfWeek: number, totalDayMinutes: number): number => {
    if (!settings.enabled) return 0;
    if (settings.skipDays.includes(dayOfWeek)) return 0;
    if (totalDayMinutes < settings.minShiftMinutes) return 0;
    return settings.deductMinutes;
  }, [settings]);

  return { lunchSettings: settings, updateSettings, calcDeduction, loaded };
}

/**
 * Apply lunch deductions to payroll rows.
 * Now uses per-entry lunchMinutes from DB first, then falls back to auto-deduction settings.
 */
export function applyLunchDeductions(
  rows: Array<{
    totalMinutes: number;
    entries: Array<{
      clockIn: string | Date;
      clockOut?: string | Date | null;
      lunchMinutes?: number;
    }>;
  }>,
  settings: LunchSettings,
): Array<{ adjustedMinutes: number; deductedMinutes: number }> {
  return rows.map((row) => {
    // First: sum up any per-entry lunch minutes from DB
    let dbLunchTotal = 0;
    for (const entry of row.entries) {
      if (entry.lunchMinutes && entry.lunchMinutes > 0) {
        dbLunchTotal += entry.lunchMinutes;
      }
    }

    // If entries have DB lunch minutes, use those (they take priority)
    if (dbLunchTotal > 0) {
      return {
        adjustedMinutes: Math.max(0, row.totalMinutes - dbLunchTotal),
        deductedMinutes: dbLunchTotal,
      };
    }

    // Otherwise, use auto-deduction settings
    if (!settings.enabled) return { adjustedMinutes: row.totalMinutes, deductedMinutes: 0 };

    // Group entries by day
    const dayMap = new Map<string, { dayOfWeek: number; totalMin: number }>();
    for (const entry of row.entries) {
      if (!entry.clockOut) continue;
      const d = new Date(entry.clockIn);
      const dayKey = d.toLocaleDateString("en-CA");
      const dayOfWeek = d.getDay();
      const durationMs = new Date(entry.clockOut).getTime() - d.getTime();
      const minutes = Math.floor(durationMs / 60000);
      const existing = dayMap.get(dayKey) || { dayOfWeek, totalMin: 0 };
      existing.totalMin += minutes;
      dayMap.set(dayKey, existing);
    }

    // Calculate total deduction
    let totalDeduction = 0;
    for (const [, day] of dayMap) {
      if (settings.skipDays.includes(day.dayOfWeek)) continue;
      if (day.totalMin >= settings.minShiftMinutes) {
        totalDeduction += settings.deductMinutes;
      }
    }

    return {
      adjustedMinutes: Math.max(0, row.totalMinutes - totalDeduction),
      deductedMinutes: totalDeduction,
    };
  });
}
