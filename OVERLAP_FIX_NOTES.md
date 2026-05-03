# PDF Overlap Fix Notes

## Budget Report (budget-report-pdf.ts)

### Problem
The `fmtHours()` returns "8h 30m (78.50 hrs)" which is ~22 chars — too wide for 60-80px columns.
Rate column "$23.00/hr" also runs into Hours column.

### Employee Labor Breakdown Table (line 385-407)
Current columns:
- Employee: x=42, w=140
- Role: x=184, w=80
- Rate: x=266, w=60 (right-aligned)
- Hours: x=328, w=60 (right-aligned) — BUT actual text drawn at x=308, w=80
- Lunch Ded.: x=390, w=60
- Cost: x=452, w=80

Fix needed: 
1. Change fmtHours to a compact 2-line format OR just show decimal hours in table cells
2. Widen Hours column, shrink others slightly
3. Use fmtHours only in summary boxes, use decimal in table cells

### Daily Hours Log (line 458-480)
- Hours column: x=294, w=70 — BUT actual text drawn at x=274, w=90
- Same overlap issue

### Summary boxes (line 280-312)
- "Hours Logged" box shows fmtHours(totalLaborMinutes) — "252h 41m (252.68 hrs)" is too long for a box

## Solution: Use SHORT format in table cells, FULL format only in summary headers
- Table cells: just show "78.50 hrs" (fmtHoursShort + " hrs")
- Summary boxes: show "252h 41m\n252.68 hrs" on two lines
- Daily date headers: show "18h 6m (18.10 hrs)" — OK since wider column
