/**
 * Payroll Period Utility
 *
 * Biweekly payroll schedule:
 * - Anchor period: April 6, 2026 (Monday) → April 18, 2026 (Saturday) = 13 days
 * - Each period: Monday → Saturday (2 work weeks)
 * - Paydays: April 10, April 24, May 8, etc. (every 2 weeks on Thursday)
 *
 * "Week" view = current week within the payroll period (Mon→Sat or Mon→today)
 * "2 Weeks" view = full current payroll period
 * "Previous Payroll" = the prior 2-week period
 */

// Anchor: Monday April 6, 2026 at midnight local time
const ANCHOR_YEAR = 2026;
const ANCHOR_MONTH = 3; // April (0-indexed)
const ANCHOR_DAY = 6;
const PERIOD_DAYS = 14; // 2 weeks (Mon of week 1 to Sun of week 2, but we display Mon-Sat)

export interface PayrollPeriod {
  startDate: Date; // Monday of week 1
  endDate: Date;   // Saturday of week 2 at 23:59:59
  week1Start: Date;
  week1End: Date;  // Saturday of week 1 at 23:59:59
  week2Start: Date;
  week2End: Date;  // Saturday of week 2 at 23:59:59
  label: string;
  periodIndex: number; // 0 = anchor period, negative = before, positive = after
}

function getAnchorDate(): Date {
  return new Date(ANCHOR_YEAR, ANCHOR_MONTH, ANCHOR_DAY, 0, 0, 0, 0);
}

/**
 * Get the payroll period that contains the given date.
 */
export function getPayrollPeriodForDate(date: Date): PayrollPeriod {
  const anchor = getAnchorDate();
  const diffMs = date.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  // Calculate which period index we're in
  let periodIndex: number;
  if (diffDays >= 0) {
    periodIndex = Math.floor(diffDays / PERIOD_DAYS);
  } else {
    periodIndex = Math.floor(diffDays / PERIOD_DAYS); // negative floor works correctly
  }

  return buildPeriod(periodIndex);
}

/**
 * Build a PayrollPeriod from a period index (0 = anchor).
 */
function buildPeriod(periodIndex: number): PayrollPeriod {
  const anchor = getAnchorDate();

  // Start of this period = anchor + (periodIndex * 14 days)
  const startDate = new Date(anchor);
  startDate.setDate(anchor.getDate() + periodIndex * PERIOD_DAYS);
  startDate.setHours(0, 0, 0, 0);

  // Week 1: Mon-Sat (days 0-5)
  const week1Start = new Date(startDate);
  const week1End = new Date(startDate);
  week1End.setDate(startDate.getDate() + 5); // Saturday
  week1End.setHours(23, 59, 59, 999);

  // Week 2: Mon-Sat (days 7-12)
  const week2Start = new Date(startDate);
  week2Start.setDate(startDate.getDate() + 7);
  const week2End = new Date(startDate);
  week2End.setDate(startDate.getDate() + 12); // Saturday
  week2End.setHours(23, 59, 59, 999);

  // Full period end = Saturday of week 2
  const endDate = new Date(week2End);

  // Format label
  const fmt = (d: Date) => d.toLocaleDateString([], { month: "short", day: "numeric" });
  const label = `${fmt(startDate)} – ${fmt(endDate)}`;

  return {
    startDate,
    endDate,
    week1Start,
    week1End,
    week2Start,
    week2End,
    label,
    periodIndex,
  };
}

/**
 * Get the current payroll period.
 */
export function getCurrentPayrollPeriod(): PayrollPeriod {
  return getPayrollPeriodForDate(new Date());
}

/**
 * Get the previous payroll period relative to the given period.
 */
export function getPreviousPeriod(period: PayrollPeriod): PayrollPeriod {
  return buildPeriod(period.periodIndex - 1);
}

/**
 * Get the next payroll period relative to the given period.
 */
export function getNextPeriod(period: PayrollPeriod): PayrollPeriod {
  return buildPeriod(period.periodIndex + 1);
}

/**
 * Determine which week of the payroll period "today" falls in.
 * Returns 1 or 2. If today is Sunday between weeks, returns 1.
 */
export function getCurrentWeekInPeriod(period: PayrollPeriod): 1 | 2 {
  const now = new Date();
  if (now >= period.week2Start) return 2;
  return 1;
}

/**
 * Get date range for "This Week" view — the current week within the payroll period.
 */
export function getThisWeekRange(period: PayrollPeriod): { startDate: string; endDate: string; label: string } {
  const currentWeek = getCurrentWeekInPeriod(period);
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (currentWeek === 1) {
    return {
      startDate: period.week1Start.toISOString(),
      endDate: (now < period.week1End ? now : period.week1End).toISOString(),
      label: "Week 1",
    };
  } else {
    return {
      startDate: period.week2Start.toISOString(),
      endDate: (now < period.week2End ? now : period.week2End).toISOString(),
      label: "Week 2",
    };
  }
}

/**
 * Get date range for "2 Weeks" view — the full payroll period.
 */
export function getFullPeriodRange(period: PayrollPeriod): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return {
    startDate: period.startDate.toISOString(),
    endDate: (now < period.endDate ? now : period.endDate).toISOString(),
    label: `Payroll ${period.label}`,
  };
}

/**
 * Format a payroll period for display.
 */
export function formatPeriodLabel(period: PayrollPeriod): string {
  return period.label;
}
