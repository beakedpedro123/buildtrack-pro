# BuildTrack Pro — Feature TODO

## Database & Backend
- [x] Database schema: employees, jobs, clockEntries, dailyReports, materials, budgets, photos
- [x] tRPC routers: employees, jobs, clock, reports, budgets, photos
- [x] Offline queue system with AsyncStorage sync
- [x] File upload to S3 for photos

## Authentication & Roles
- [x] PIN-based login (no OAuth, local employee auth)
- [x] Role-based access control (Owner, Secretary, Logistics, Foreman, Laborer)
- [x] Employee select screen
- [x] Auth context/provider

## Theme & Branding
- [x] Construction orange/navy theme in theme.config.js
- [x] App logo generation
- [x] Tab bar icons for all tabs

## Navigation
- [x] Tab bar with role-adaptive visibility
- [x] Stack navigators for Job Detail, Employee, Reports
- [x] Auth guard (redirect to login if not authenticated)

## Clock In/Out
- [x] Clock in/out screen with large button
- [x] Jobsite selection before clock-in
- [x] GPS location capture
- [x] Offline queue for clock entries
- [x] Background sync when connectivity returns
- [x] Foreman crew clock-in manager

## Daily Reports
- [x] Daily report form (materials, work completed, notes)
- [x] Materials checklist with quantities
- [x] Work completed checklist
- [x] Photo capture and upload
- [x] Photo gallery per job
- [x] Report history list

## Job Management
- [x] Jobs list screen
- [x] Job detail screen (crew, hours, budget, reports, photos)
- [x] Job creation (Owner/Secretary/Logistics)
- [x] Job status management

## Budget Tracking
- [x] Budget creation per job with categories
- [x] Expense tracking (materials, labor, equipment)
- [x] Budget vs actual progress bar
- [x] QuickBooks sync screen (manual trigger + status)

## Employee Management
- [x] Employee list screen
- [x] Add/edit employee form
- [x] Role assignment
- [x] Time history per employee
- [x] Hours summary (daily/weekly/monthly)

## Dashboards
- [x] Owner dashboard (KPI cards, active jobs, budget burn)
- [x] Secretary dashboard (job progress, employee status)
- [x] Logistics dashboard (materials, assignments)
- [x] Foreman dashboard (crew status, daily report CTA)
- [x] Laborer dashboard (today's job, clock status)

## Notifications & Offline
- [x] Offline connectivity banner
- [x] Sync status indicator
- [ ] Push notification for report submissions (future enhancement)

## Settings
- [ ] PIN change screen (future enhancement)
- [ ] Theme toggle (light/dark) (future enhancement)
- [ ] Offline data management (future enhancement)

## Phase 2 Features (User Request)

### Hours Self-Service
- [x] My Hours tab/screen for all employees (daily/weekly/monthly breakdown)
- [x] Hours summary cards with total hours and earnings estimate
- [x] Clock history list with job names and durations

### Payroll Reports (Secretary)
- [x] Payroll report screen with pay period selector
- [x] Per-employee hours and earnings table
- [x] CSV export of payroll data (downloadable to computer)
- [x] Payroll report backend endpoint

### Management Meetings
- [x] Meetings tab (visible to owner, secretary, logistics, foreman)
- [x] Meeting room screen with start/stop recording
- [x] Audio recording using expo-audio
- [x] Upload recording to server for AI transcription
- [x] AI-generated meeting summary (using server LLM)
- [x] Meeting history list with summaries
- [x] Meeting detail screen showing full transcript + summary

### Weekly Goals
- [x] Weekly goals screen linked to meeting summaries
- [x] Create/edit/complete goals
- [x] Goals tied to specific meetings
- [x] Goals progress tracker
- [x] Goals database schema and API

### App Distribution
- [x] App ready for Publish (APK/IPA) via UI Publish button

## Phase 3 Features (User Request)

### Friday Meeting Notification
- [x] Request notification permissions on login for management roles
- [x] Schedule recurring weekly notification every Friday at 2:45 PM
- [x] Cancel/reschedule notification on logout or role change
- [x] Notification settings screen (enable/disable toggle)
- [x] Notification taps deep-link into the Meetings tab
