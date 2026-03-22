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

## Phase 4 Features — Role-Based Access Control
### Jobs Screen
- [x] Laborer/Foreman: show job progress only (no budget amounts, no cost figures)
- [x] Owner/Secretary/Logistics: full budget view unchanged
- [x] Hide "+ New Job" button from Laborer/Foreman

### Hours & Payroll
- [x] Only Owner can see hourly rates on any employee
- [x] Secretary/Logistics can see hours but NOT pay rates or estimated pay
- [x] Laborer/Foreman can only see their own hours (no pay rate shown)
- [x] Time editing (alter clock-in/out) restricted to Owner/Secretary/Logistics only
- [x] Payroll export tab hidden from Laborer/Foreman

### Team Management
- [x] Laborer/Foreman cannot access the Team tab at all
- [x] Secretary/Logistics can view team list but cannot see pay rates
- [x] Only Owner can see/edit hourly rates in employee profiles
- [x] Add/edit/deactivate employees restricted to Owner/Secretary/Logistics

### Backend RBAC
- [x] Server-side guard on createJob/updateJob mutations (owner/secretary/logistics only)
- [x] Server-side guard on createEmployee/updateEmployee mutations
- [x] Server-side guard on updateClockEntry (time alteration) mutations
- [x] Server-side: strip hourlyRate from employee responses for non-owner callers

## Phase 5 Bug Fixes & Features

### Meetings Screen
- [x] Fix title text input (keyboard/focus issue)
- [x] Add auto-title option (e.g. "Friday Meeting — Mar 21")
- [x] Fix start call / create meeting button
- [x] Allow manual title override

### Weekly Goals
- [x] Fix goal title text input
- [x] Add week-by-week navigation
- [x] Open goals access to Foreman role (was management only)
- [x] Goals visible to all except Laborer

### Logistics Role Permissions
- [x] Fix: Logistics can add new employees
- [x] Fix: Logistics can create new jobs

### Profile / Name Editing
- [x] Add profile screen accessible from dashboard
- [x] Allow any employee to change their display name
- [x] Owner can change their name from "Owner" to their real name

### Theme
- [x] Change brand colors to white, black, and gold
- [x] Update all accent colors, buttons, badges, and tab bar
- [x] Update app logo to match new theme

## Phase 6 Features

- [x] Update daily field report work types to 13 construction tasks
- [x] Add QuickBooks estimates sync to jobs (pull QB estimate into job budget)
- [x] Build KPI tracker screen (owner + secretary can define and track KPIs)
- [x] KPI categories: revenue, labor, jobs, safety, schedule
- [x] Secretary can create/update KPI values; owner sees dashboard view

## Phase 7 — Final Polish

### Clock-to-Budget Sync
- [x] Clock entries labor hours auto-calculate into job budget in real time
- [x] Job budget tab shows actual labor cost from clock entries

### Tab Visibility
- [x] Hide Clock tab from Owner, Secretary, and Logistics
- [x] Hide My Hours tab from Owner, Secretary, and Logistics

### Email Invite for New Employees
- [x] Add email field when creating new employee
- [x] Send invite link (shareable via text/email/AirDrop) for employee to set their own PIN
- [x] Employee can create PIN from invite link

### Branding
- [x] Integrate Carranza Custom Construction logo on dashboard
- [x] Logo displayed prominently on main screen

## Phase 8 — Critical Bug Fixes & Final Polish

### Meeting Summary (Bug)
- [x] Fix AI transcription/summary not generating after recording
- [x] Ensure recording uploads to server correctly
- [x] Ensure LLM generates summary from transcript
- [x] Meeting summary syncs to goals tab for delegation

### Goals Tab (Bug)
- [x] Fix goal creation — text input and save not working
- [x] Wire "Pull from Meeting" to import AI-suggested goals
- [x] Goals assignable/visible to management for delegation

### Estimate PDF Upload + AI Extraction
- [x] Add PDF upload button to job estimates tab
- [x] Server-side AI reads PDF and extracts all line items
- [x] Auto-populate estimate line items from PDF data
- [x] Test with Hardy/Gruett residence estimate PDFs

### Field Report Photos (Bug)
- [x] Fix photo upload not displaying in report view
- [x] Verify S3 upload and URL retrieval working
- [x] Show photo count and thumbnails on report cards

### Employee Invite Flow (Bug)
- [x] Fix broken invite link generation/sharing
- [x] Smoother onboarding: generate invite code for new employees
- [x] New employee can set their own name and PIN from invite

### Full Polish Pass
- [ ] Review all screens for dead ends, broken buttons, or missing feedback
- [ ] Ensure all flows work end-to-end
- [ ] App Store readiness check

### Estimate Analysis & AI Bidding Helper
- [x] Analyze Hardy and Gruett residence estimates for pricing patterns
- [ ] Build AI-powered estimate builder that learns from past estimates
- [ ] Auto-suggest line items and pricing based on historical data
- [ ] Make bidding workflow simpler with templates from past estimates

## Phase 9 — Photo Upload Fix & Goals Assignment

### Field Report Photos (Bug)
- [x] Add explicit camera and media library permission requests
- [x] Fix photo upload flow — photos not saving after camera capture
- [x] Show uploaded photo count correctly (not stuck at 0/10)
- [x] Verify photo displays in expanded report view

### Goals Assignment
- [x] Add employee picker when creating/editing goals (assign to Lupe, Pablo, Ricky, Juan, etc.)
- [x] Filter goals view — each employee only sees goals assigned to them
- [x] Owner/management sees all goals with assignee names
- [x] AI meeting summary auto-suggests assignee from transcript
- [x] Manual override option to reassign goals

## Phase 10 — Replace QuickBooks with PDF Reports & Remove Estimates

### Replace QuickBooks Sync
- [x] Remove all QuickBooks sync buttons and references across all tabs
- [x] Add PDF report generation for job budgets
- [x] Add PDF report generation for daily field reports
- [x] PDF reports shareable via system share sheet

### Remove Estimates Tab
- [x] Remove Estimates tab from job detail view
- [x] Remove QB estimates upload/extraction code from jobs.tsx
- [x] Keep estimate data in DB for future separate estimating app integration
