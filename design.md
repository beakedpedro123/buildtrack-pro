# BuildTrack Pro — Mobile App Design

## Brand Identity

- **App Name:** BuildTrack Pro
- **Primary Color:** `#E8500A` (Construction Orange)
- **Secondary Color:** `#1A2332` (Dark Navy)
- **Accent:** `#F5A623` (Safety Yellow)
- **Background:** `#F7F8FA` (Light) / `#0F1923` (Dark)
- **Surface:** `#FFFFFF` (Light) / `#1A2332` (Dark)
- **Success:** `#22C55E` | **Warning:** `#F59E0B` | **Error:** `#EF4444`

---

## User Roles

| Role | Count | Permissions |
|------|-------|-------------|
| Owner | 1 | Full access: all dashboards, reports, budgets, employees, QuickBooks |
| Secretary | 1 | View all jobs, manage employees, track progress, export reports |
| Logistics | 1 | Manage materials, job assignments, budget tracking |
| Foreman | 2 | Clock in/out team, submit daily reports, upload photos |
| Laborer | 14 | Clock in/out (self), view assigned jobs |

---

## Screen List

### Auth
- **Login Screen** — PIN or biometric login per employee (no OAuth needed, local auth)
- **Employee Select Screen** — Tap your name from the employee list

### Laborer Flow
- **My Dashboard** — Today's job, clock in/out button, hours today
- **Clock In/Out** — GPS stamp, offline queue, jobsite selection
- **My Time History** — Weekly/monthly hours log

### Foreman Flow
- **Foreman Dashboard** — Active job card, crew status (who's clocked in), daily report CTA
- **Crew Clock-In Manager** — See all laborers, clock them in/out manually
- **Daily Report Form** — Materials used, work completed checklist, notes, photo upload
- **Photo Gallery** — All photos uploaded for current job

### Secretary Flow
- **Secretary Dashboard** — All active jobs summary, employee status overview
- **Employee Manager** — Add/edit employees, assign roles, view hours
- **Job Progress Tracker** — Real-time job cards with photo previews and report history
- **Reports Export** — Export time sheets, daily reports as CSV/PDF

### Logistics Flow
- **Logistics Dashboard** — Material inventory, job assignments, budget overview
- **Material Log** — Track materials ordered, delivered, used per job
- **Job Assignment** — Assign employees to jobs, manage schedules

### Owner Flow
- **Owner Dashboard** — KPI cards: active jobs, total hours this week, budget burn rate
- **All Jobs** — List of all jobs with status, budget, progress
- **Job Detail** — Full job view: crew, budget, daily reports, photos, timeline
- **Budget Manager** — Per-job budget, spending categories, QuickBooks sync status
- **Employee Overview** — All 18 employees, roles, hours, payroll summary
- **QuickBooks Sync** — Manual sync trigger, sync history, connection status

### Shared Screens
- **Job Detail** — Accessible by all roles (read-only for laborers)
- **Notifications** — System alerts, sync status, report submissions
- **Settings** — Theme toggle, PIN change, offline data management

---

## Key User Flows

### Flow 1: Laborer Clock-In (Offline Capable)
1. Open app → tap name on employee select
2. Enter PIN → land on My Dashboard
3. Tap "Clock In" → select jobsite from list
4. App records timestamp + GPS (stores locally if offline)
5. Background sync when connectivity returns

### Flow 2: Foreman Daily Report
1. Foreman Dashboard → tap "Submit Daily Report"
2. Select date (defaults today) and job
3. Fill checklist: materials used (with quantities), work completed items
4. Add notes in free-text field
5. Tap camera icon → take/select photos
6. Submit → syncs to server, notifies Owner/Secretary

### Flow 3: Owner Reviews Progress
1. Owner Dashboard → tap active job card
2. Job Detail opens: see crew clocked in, hours today, budget status
3. Scroll to Daily Reports → tap any report to expand
4. Swipe through photo gallery
5. Tap Budget tab → see spend vs budget per category

### Flow 4: QuickBooks Sync
1. Owner → Budget Manager → tap "Sync to QuickBooks"
2. App sends job budgets, material costs, labor hours
3. Success/error toast with sync timestamp

---

## Navigation Structure

### Tab Bar (Role-Adaptive)
- **Home** (Dashboard for current role)
- **Jobs** (Job list / assigned jobs)
- **Clock** (Clock in/out — center prominent button)
- **Reports** (Daily reports / field logs)
- **Team** (Employee management — Secretary/Owner/Logistics only)

### Stack Navigators
- Job Detail → Budget → Category Detail
- Employee → Time History → Export
- Daily Report → Photo Gallery

---

## Component Design Patterns

- **Job Card:** Orange left border, job name, status badge, budget bar, crew count
- **Clock Button:** Large circular button, green when clocked out (tap to clock in), red when clocked in (tap to clock out)
- **Daily Report Card:** Date header, completion checkmark, photo thumbnail strip, submitted-by badge
- **Budget Bar:** Horizontal progress bar, color shifts from green → yellow → red as budget is consumed
- **Employee Row:** Avatar initials circle, name, role badge, clock status dot (green=in, gray=out)
- **Offline Banner:** Amber banner at top when device has no connectivity, shows queued items count
