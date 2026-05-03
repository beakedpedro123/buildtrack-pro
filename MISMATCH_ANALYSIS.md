# Timecard PDF vs UI Data Mismatch Analysis

## Problem
- UI shows: 87h 45m / $2,106.00 / 10 days / 11 shifts
- PDF shows: 75.43 hrs / $1,810.40 / 9 days

## Root Causes Found

### 1. Day Grouping Timezone Mismatch
- **UI (getDetailedTimecard)**: Groups by `new Date(entry.clockIn).toISOString().slice(0, 10)` — UTC timezone
- **PDF (buildReportData)**: Groups by `new Date(entry.clockIn).toLocaleDateString("en-CA", { timeZone: TZ })` — Mountain Time

### 2. Lunch Deduction Inconsistency
- **UI (getDetailedTimecard)**: Does NOT subtract lunch minutes from totalMinutes
- **PDF (buildReportData)**: Subtracts totalLunchMinutes from totalMinutes (line 197: `totalMinutes: Math.max(0, totalMinutes - totalLunchMinutes)`)

### 3. Date Range Filtering
Both use `gte(clockIn, startDate) AND lte(clockIn, endDate)` — same logic, so this should be consistent.

### 4. Open Entries
- **UI**: Includes entries without clockOut (duration = 0)
- **PDF**: Skips entries without clockOut (`if (!entry.clockOut) continue;`)

## Fix Plan
1. Make getDetailedTimecard use Mountain Time for day grouping (consistent with PDF)
2. Make getDetailedTimecard also compute and subtract lunch deductions (consistent with PDF)
3. Both should handle open entries the same way
4. The UI should show the same totals as the PDF
