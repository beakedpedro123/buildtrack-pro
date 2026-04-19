# BuildTrack Pro — Remaining Work to Publish as SaaS

This document lists all uncompleted items from the project todo.md, organized by category.

---

## 1. Multi-Tenant / SaaS Conversion (Not Yet Started)

The plan to convert BuildTrack Pro from a single-company app to a multi-tenant SaaS with monthly subscriptions has not been started yet. This would include:

- [ ] Multi-tenant database architecture (tenant isolation, per-company data)
- [ ] Tenant onboarding flow (company signup, admin setup)
- [ ] Stripe integration for monthly subscription billing
- [ ] Subscription management (plans, upgrades, cancellations)
- [ ] Tenant admin panel (manage employees, roles, settings)
- [ ] App Store / Play Store listing and submission

> **Note:** No gameplan file for the SaaS conversion was found in the project. This may have been discussed in a previous conversation session that is no longer in context.

---

## 2. Biweekly Salary System (Partially Done)

- [ ] Add salariedEmployees config: Pablo (ID=4) and Lupe (ID=5) each $2,500 biweekly / $5,000 monthly
- [ ] Add payPeriods table to DB: start date, end date, pay date, status
- [ ] Add salaryAllocations table: period, employee, amount, job allocations breakdown

> Salary display in payroll reports and salary badges are already done.

---

## 3. Detailed Payroll PDF Report

- [ ] Build server endpoint to generate detailed payroll PDF
- [ ] Include employee name, role, hourly rate, daily breakdown
- [ ] Include exact clock-in/out times per day, job site per entry
- [ ] Include daily totals, weekly totals, period totals
- [ ] Include job cost breakdown per employee
- [ ] Secretary can download from payroll screen
- [ ] Custom date range picker (choose exact start/end dates) on payroll screen
- [ ] Date picker on native app payroll tab
- [ ] Date picker on PWA payroll page

---

## 4. UI / Design Polish

### Gold Backgrounds
- [ ] Generate blended gold wave + geometric backgrounds for each tab
- [ ] Home screen: curvy gold waves (B style)
- [ ] Other tabs: blend to subtle geometric gold lines (D style)
- [ ] Apply backgrounds to native app screens

### Tab UI Revamp
- [ ] Revamp all tabs to high-end premium look
- [ ] Make tabs sleeker and more polished
- [ ] Consistent premium feel across all screens

### Goals Tab Revamp
- [ ] Sleek flashcard-style UI with no borders
- [ ] High-end look, smooth and modern
- [ ] Remove old bordered card style

### Home Screen
- [ ] Add motivational/positive message on the home screen for Pedro
- [ ] Create sleek gold streak/accent background mockups

### Daily Positive Messages
- [ ] Add rotating daily positive messages for ALL roles (owner, secretary, foreman, laborer)
- [ ] Messages change daily, not just per session
- [ ] Owner gets unique motivational messages too

---

## 5. Goal System Enhancements

- [ ] Anyone can set goals for anyone
- [ ] Users can only see goals they created or goals set for them
- [ ] Foremen cannot see goals other foremen set for their employees
- [ ] Owner account can see ALL goals across all employees
- [ ] Goal creation includes who set it and who it's for

---

## 6. Pivot AI Enhancements

- [ ] Pivot can find and return images of hardware from the web when asked
- [ ] Image search integrated into Pivot tool calling
- [ ] Test steel lookup end-to-end via Pivot chat on deployed version

---

## 7. Photo Upload Fixes

- [ ] Audit PWA photo upload flow vs APK
- [ ] Fix PWA field report photo upload
- [ ] Ensure iOS photo upload works (check ph:// URI handling)

---

## 8. Feature Parity (PWA + iOS match APK)

- [ ] Audit all APK screens vs PWA screens for gaps
- [ ] Fix any missing or broken features on PWA
- [ ] Ensure iOS version matches APK behavior
- [ ] Rebuild and deploy PWA
- [ ] Convert all time displays in PWA to 12hr AM/PM
- [ ] Ensure time pickers use 12hr format

---

## 9. Platform Build / Deployment

- [ ] Rebuild app for iOS/Android with new backend URL (pending user rebuild)
- [ ] Verify data loads on Android and iOS devices
- [ ] Remove standalone KPIs tab from tab bar (already done in sandbox)
- [ ] Ensure Safety tab is visible (already done in sandbox)
- [ ] Ensure Labor Costs are on Dashboard (already done in sandbox)
- [ ] Rebuild iOS from sandbox code to match Android
- [ ] Rebuild Android APK from same code for parity
- [ ] After this update, prepare iOS version update (Apple approved v23)

---

## 10. AI Estimating / Bidding (Future Feature)

- [ ] Build AI-powered estimate builder that learns from past estimates
- [ ] Auto-suggest line items and pricing based on historical data
- [ ] Make bidding workflow simpler with templates from past estimates

---

## 11. Bug Fixes (Remaining / Unverified)

- [ ] Fix Pablo Carranza role to Office Manager (not owner)
- [ ] Ensure only Pedro is the owner account
- [ ] Ensure all screens (dashboard, payroll, hours, timecard) reflect adjusted times immediately
- [ ] Diagnose employee ID changes that disconnected clock entries from employees
- [ ] Reconnect clock entries to correct employees based on names/timestamps

---

## 12. General Polish / Future Enhancements

- [ ] Push notification for report submissions
- [ ] PIN change screen
- [ ] Theme toggle (light/dark)
- [ ] Offline data management
- [ ] Review all screens for dead ends, broken buttons, or missing feedback
- [ ] Ensure all flows work end-to-end
- [ ] App Store readiness check
- [ ] Full audit: test all features on APK and web for bugs
- [ ] Optimize app performance

---

## Summary Count

| Category | Remaining Items |
|----------|----------------|
| Multi-Tenant / SaaS Conversion | ~6 major items (not started) |
| Biweekly Salary System | 3 items |
| Detailed Payroll PDF | 9 items |
| UI / Design Polish | ~15 items |
| Goal System Enhancements | 5 items |
| Pivot AI Enhancements | 3 items |
| Photo Upload Fixes | 3 items |
| Feature Parity (PWA/iOS) | 6 items |
| Platform Build / Deployment | 8 items |
| AI Estimating / Bidding | 3 items |
| Bug Fixes | 5 items |
| General Polish | 9 items |
| **Total** | **~75 items** |

> Many of these items are already partially done or are "rebuild and verify" tasks. The biggest new work is the **Multi-Tenant / SaaS Conversion** which is the core requirement for publishing as a subscription service.
