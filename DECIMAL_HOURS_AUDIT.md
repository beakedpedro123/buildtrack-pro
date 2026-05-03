# Minutes-to-Decimal Hours Audit

## Standard: minutes / 60 with proper rounding

### UI Screens — formatDuration functions (display as "Xh Ym")
These are correct — they show hours and minutes separately, no decimal conversion needed:
- hours.tsx: `Math.floor(minutes / 60)` + `minutes % 60` → "Xh Ym" ✅
- payroll.tsx: `Math.floor(minutes / 60)` + `minutes % 60` → "Xh Ym" ✅
- timecard/[id].tsx: `Math.floor(minutes / 60)` + `minutes % 60` → "Xh Ym" ✅
- clock.tsx: `Math.floor(ms / 3600000)` + `Math.floor((ms % 3600000) / 60000)` → "Xh Ym" ✅
- index.tsx: Same as clock.tsx ✅
- team.tsx: Same as clock.tsx ✅

### UI Screens — Decimal hours display
- hours.tsx line 242: `((data?.totalMinutes || 0) / 60).toFixed(1)` → "X.X hours total" ✅
- timecard/[id].tsx line 476: `((data?.totalMinutes || 0) / 60).toFixed(1)` → "X.X hrs total" ✅
- payroll.tsx line 752: `(row.displayMinutes / 60).toFixed(1)` → "X.X hrs" ✅
- charts.tsx line 515: `Math.round(m.totalMinutes / 60 * 10) / 10` → same as toFixed(1) ✅
- charts.tsx line 626: `(m.totalMinutes / 60).toFixed(1)` → "X.X hrs" ✅
- jobs.tsx line 202: `Math.round(laborCost.totalMinutes / 60 * 10) / 10` → same as toFixed(1) ✅

### UI Screens — Pay calculations (minutes → dollars)
- hours.tsx calcEstimatedPay: `(totalMinutes / 60) * rate` → .toFixed(2) ✅
- timecard/[id].tsx calcPay: `(minutes / 60) * rate` → .toFixed(2) ✅
- payroll.tsx calcPay: `(totalMinutes / 60) * rate` → .toFixed(2) ✅
- payroll.tsx calcPayNum: `(totalMinutes / 60) * rate` ✅
- payroll.tsx totalPayroll: `(r.displayMinutes / 60) * rate` ✅

### PDF Generators — fmtHours functions
- payroll-pdf.ts: `(minutes / 60).toFixed(2)` → 2 decimal places ✅
- budget-report-pdf.ts: `(minutes / 60).toFixed(1)` → 1 decimal place ⚠️ INCONSISTENT
- field-reports-pdf.ts: `(minutes / 60).toFixed(1)` → 1 decimal place ⚠️ INCONSISTENT
- job-completion-pdf.ts: `(minutes / 60).toFixed(1)` → 1 decimal place ⚠️ INCONSISTENT

### PDF Generators — Cost calculations
- payroll-pdf.ts: `(entry.durationMinutes / 60) * rate` ✅
- payroll-pdf.ts: `(tc.totalMinutes / 60) * rate` ✅
- budget-report-pdf.ts: `(netMins / 60) * rate` ✅
- budget-report-pdf.ts: `(totalLaborMinutes / 60) * hourlyRate` ✅
- field-reports-pdf.ts: `(netMins / 60) * rate` ✅

## Issues Found:
1. **INCONSISTENT DECIMAL PLACES**: payroll-pdf uses .toFixed(2) for hours, but budget/field/job-completion use .toFixed(1)
   - Payroll shows "87.83 hrs" while budget shows "87.8 hrs" for the same data
   - Should standardize to .toFixed(2) for accuracy on all PDFs

2. **UI vs PDF decimal places**: UI uses .toFixed(1) for display, PDFs should use .toFixed(2) for precision
   - This is acceptable since UI is a summary view, PDFs are detailed reports

3. **formatHours in index.tsx and labor-costs.tsx**: Shows "Xh Ym" format (not decimal) — this is fine for UI display
