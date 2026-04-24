/**
 * useLunchSettings — Company-level lunch/break deduction settings
 *
 * Owner configures:
 * - Whether auto-deduction is enabled
 * - Minutes to deduct per qualifying day (default 30)
 * - Minimum shift length to qualify (default 6 hours / 360 min)
 * - Which days of the week to skip deduction (e.g., Friday = short day)
 *
 * Applied at display/payroll time — raw clock entries stay untouched.
 * Stored in AsyncStorage (syncs per device; owner-only setting).
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

  useEffect(() => {
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
  }, []);

  const updateSettings = useCallback(async (updates: Partial<LunchSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    await AsyncStorage.setItem(LUNCH_SETTINGS_KEY, JSON.stringify(newSettings));
  }, [settings]);

  /**
   * Calculate lunch deduction for a given day's total minutes.
   * @param dayOfWeek - 0=Sun, 1=Mon, ..., 6=Sat
   * @param totalDayMinutes - total minutes worked that day
   * @returns minutes to deduct (0 if not applicable)
   */
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
 * Each row has totalMinutes and entries with clockIn dates.
 * Returns adjusted totalMinutes per row.
 */
export function applyLunchDeductions(
  rows: Array<{ totalMinutes: number; entries: Array<{ clockIn: string | Date; clockOut?: string | Date | null }> }>,
  settings: LunchSettings,
): Array<{ adjustedMinutes: number; deductedMinutes: number }> {
  return rows.map((row) => {
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
