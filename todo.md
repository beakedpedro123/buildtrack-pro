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

## Phase 19 — Backend Deployment

- [x] Expose backend API server publicly
- [x] Update mobile app to point to public backend URL
- [ ] Rebuild app for iOS/Android with new backend URL (pending user rebuild)
- [ ] Verify data loads on Android and iOS devices
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

## Phase 11 — Photo Upload Bug (Still Broken)

- [x] Fix photo upload — rewritten to use FormData file upload instead of base64
- [x] Fix report submission — photos now upload via /api/upload then save URL to DB
- [x] Traced full pipeline: camera URI → FormData → /api/upload → S3 URL → tRPC save to DB

## Phase 12 — Photo Upload Still Broken

- [x] Root cause: hand-rolled multipart parser corrupted binary data (latin1 encoding)
- [x] Replaced with multer for proper multipart parsing on server
- [x] Client uses native file URI in FormData (no base64 needed)
- [x] Added Android pending result recovery for camera/gallery
- [x] All 11 unit tests passing

## Phase 13 — expo-image-picker Crash Fix

- [x] Downgraded expo-image-picker from v55.0.13 to v17.0.10 (SDK 54 compatible)
- [x] Fixed mediaTypes API: changed from v55 array format to v17 MediaTypeOptions.Images
- [x] Added expo-image-picker plugin to app.config.ts with camera/photo library permissions
- [x] All 12 unit tests passing — awaiting re-publish to verify on device

## Phase 14 — Labor Cost KPI Dashboard

### Backend API
- [x] Add laborCostDashboard tRPC endpoint: aggregate clock entries by job with employee hourly rates
- [x] Add weeklyLaborCost tRPC endpoint: aggregate clock entries by week across all jobs
- [x] Add laborCostByEmployee tRPC endpoint: aggregate per-employee labor cost for a date range

### Dashboard Screen
- [x] Create new labor-costs.tsx tab screen for the Labor Cost Dashboard
- [x] Summary cards: Total Labor Spend (this week), Total Labor Spend (this month), Active Jobs count
- [x] Per-Job breakdown: horizontal bar chart showing labor cost per active job
- [x] Weekly trend: line/bar chart showing labor cost per week for the past 8 weeks
- [x] Per-Employee breakdown: list showing each employee's hours and labor cost for selected period
- [x] Period selector: toggle between This Week / This Month / Last 30 Days
- [x] Role guard: only Owner, Secretary, Logistics can access (Owner sees dollar amounts, others see hours only)

### Navigation
- [x] Add labor-costs tab to _layout.tsx with appropriate icon
- [x] Add icon mapping for dashboard icon in icon-symbol.tsx

## Phase 14b — Goals, Reports, and Clock Fixes

### Weekly Goals
- [x] Remove laborer access to Goals tab entirely
- [x] Each person only sees goals assigned to them (not all goals)
- [x] Owner can see all goals and reassign any goal to any employee
- [x] Owner can adjust/reassign existing goals freely

### Field Reports
- [x] Enable Logistics role to create field reports (now all roles can submit)
- [x] Foreman, Logistics, and Laborer can all submit reports

### Clock Management
- [x] Owner, Secretary, and Logistics can clock any employee in/out at will
- [x] Add employee picker for management roles on Clock screen
- [x] Management can clock out any currently clocked-in employee

## Phase 15 — UI Cleanup, Keyboard Fix, Taxes/Insurance

### Tab Cleanup
- [x] Remove KPI tab from tab layout
- [x] Remove Labor Cost tab from tab layout
- [x] Move labor cost dashboard data into Home screen (replace recent reports section)

### Keyboard Fix
- [x] Fix keyboard covering text inputs across the entire app
- [x] Ensure content scrolls up when keyboard opens so user can see what they're typing

### SafeArea Top Spacing
- [x] Add extra top padding on all screens to prevent UI elements overlapping with status bar/notch
- [x] Tested with different inset sizes (small notch, iPhone X, iPhone 14 Pro)

### Taxes, Workers Comp, Liability Insurance
- [x] Add configurable tax rate per job
- [x] Add workers comp rate per job
- [x] Add liability insurance rate per job
- [x] Show cost breakdown per job: labor + taxes + workers comp + insurance
- [x] Sync these rates with the labor cost data on the Home screen

## Phase 16 — Budget Alert System

### Backend
- [x] Created getBudgetAlerts server function: calculates total spend per job (labor + overhead + expenses)
- [x] Created budgetAlerts.getAlerts tRPC endpoint for budget threshold checks
- [x] Alert thresholds: 80% warning (yellow), 90% danger (orange), 100%+ critical (red)

### Client UI
- [x] Budget Alerts section on Home screen with color-coded banners for owner
- [x] Each alert shows: job name, % used, spend breakdown (labor/overhead/expenses), progress bar
- [x] Budget alert banner in Jobs Budget tab when job exceeds 80%/90%/100%
- [x] Color-coded: green < 80%, yellow 80-90%, orange 90-100%, red > 100%

### Goal Deadlines
- [x] Added deadline column to weeklyGoals table
- [x] Quick deadline picker: No Deadline, End of Week, Tomorrow, +3 Days, +1 Week
- [x] Deadline sent with goal creation and update mutations
- [x] Overdue indicator (red) on goal cards for past-deadline goals
- [x] "Due Soon" indicator (yellow) for goals due within 24 hours
- [x] Deadline badge with date shown on goal cards

## Phase 17 — Foreman Access Restrictions & Safety Meetings

### Foreman Access — Hide Dollar Amounts
- [x] Foreman sees budget as percentages only — no dollar amounts anywhere (canSeeDollars = isManagement)
- [x] Foreman cannot see hourly rates, labor costs, or expense totals (canSeeDollars = isManagement)
- [x] Foreman job detail Budget tab restricted to management only
- [x] Home screen: foreman sees hours only, no cost data
- [x] Laborer access remains minimal: just hours, clock in/out, settings

### Safety Meetings Tab (Foreman)
- [x] Created safetyMeetings DB table (topic, date, attendees, notes, photos, jobId, conductedBy)
- [x] Created safetyTopics DB table (title, content, category, createdBy, isActive)
- [x] tRPC endpoints: create/list/delete safety meetings, create/list/update/delete safety topics
- [x] Safety tab visible to Foreman and management roles
- [x] Document safety meeting: topic, attendees, notes, photos — same layout as field reports
- [x] Management can post safety topics that sync to foreman's Safety tab

### Meeting Schedule Tracking
- [x] Safety meetings required 3x per week — compliance card on Safety tab
- [x] Daily goal review meetings required every day — compliance card on Safety tab
- [x] Weekly compliance summary: X/3 safety meetings, X/5 goal reviews completed
- [x] Color-coded status: green (met target), yellow/warning (behind)

### Icon & Navigation
- [x] Added shield.fill and shield.checkmark.fill icon mappings
- [x] Added Safety tab to _layout.tsx for Foreman and management roles

## Phase 18 — OSHA Safety Topics Library & Access Restriction

### Safety Tab Access
- [x] Restrict Safety tab to Owner, Logistics, and Foreman only (canViewSafety)
- [x] Remove Secretary access to Safety tab
- [x] Laborers cannot see Safety tab (already excluded)

### OSHA Safety Topics Library
- [x] Pre-populated 30 OSHA-aligned safety topics into the database
- [x] Categories: fall_protection, electrical, excavation, scaffolding, ppe, fire, chemical, equipment, heat_stress, general
- [x] Each topic includes title, detailed talking points/content, and discussion prompts
- [x] Topics ready for foremen to select during toolbox talks

## Phase 19 — UI Spacing Fixes (Device-Specific)

### Bottom Grey Border
- [x] Tab bar background now matches app background color (colors.background)
- [x] Tab bar extends fully to bottom edge

### Top Content Too High
- [x] Added 12pt extra top padding in ScreenContainer for native devices
- [x] Job detail modal header uses Math.max(insets.top + 12, 28) for safe spacing
- [x] All screens have sufficient clearance from status bar

### Modal Header Top Padding (all screens)
- [x] Fixed modal headers in jobs.tsx, reports.tsx, team.tsx, kpis.tsx, meetings.tsx, goals.tsx, clock.tsx
- [x] All use Math.max(insets.top + 12, 28) for pageSheet/formSheet modals

### Role-Based Home Screen
- [x] Management (owner/secretary/logistics): full dashboard with labor costs, budget alerts, collapsible active jobs
- [x] Active Jobs section is now collapsible (tap to expand/collapse)
- [x] Laborer Home: clean view with company logo, name, clock status card, daily motivational quote, quick actions
- [x] Foreman Home: personal view with clock status, quick actions (Field Report, Safety, Goals), jobsites
- [x] Creative laborer features: daily motivational quotes, large clock timer, quick-access buttons

## Phase 20 — EAS Build Configuration for iOS

- [x] Created eas.json with development, preview, and production profiles
- [x] Verified app.config.ts has correct iOS bundle identifier
- [x] Providing step-by-step instructions for user

## Phase 21 — Sync iOS Build with Latest Code

- [ ] Remove standalone KPIs tab from tab bar (already done in sandbox)
- [ ] Ensure Safety tab is visible (already done in sandbox)
- [ ] Ensure Labor Costs are on Dashboard (already done in sandbox)
- [ ] Rebuild iOS from sandbox code to match Android
- [ ] Rebuild Android APK from same code for parity

## Phase 22 — Comprehensive Audit & Fixes

### Database Fix
- [x] Fix Lupe Mejia role from "owner" to "secretary" in database

### Mobile App Label Fixes
- [x] Fix "Secretary" → "Office Manager" in team.tsx ROLE_LABELS
- [x] Fix "Secretary" → "Office Manager" in profile.tsx ROLE_LABELS
- [x] Fix "Secretary" → "Office Manager" in login.tsx ROLE_LABELS

### Mobile App Permission Fixes
- [x] Fix canSeeRates in team.tsx to include secretary role
- [x] Fix canSeePayRate in hours.tsx to include secretary role
- [x] Fix canSeeDollars in labor-costs.tsx to include secretary and logistics roles

### PWA Missing Pages (Critical)
- [x] Create LaborCostsPage.tsx for /more/labor route
- [x] Create HoursPage.tsx for /more/hours route
- [x] Add routes to App.tsx for both new pages

## Phase 23 — Goals Overhaul, Pivot Personality, Safety Topics

### Goals System Overhaul
- [x] Replace quick deadline buttons with exact date/time picker
- [x] Make goals clickable to open edit modal (adjust title, description, priority, assignee, deadline)
- [x] Allow foreman to create goals for laborers (expand canManage to include foreman)
- [x] Laborers can see their assigned goals (expand canView to include laborer)
- [x] Secretary can create goals to remind team about hour issues or notify owner/logistics

### Pivot AI Personality Upgrade
- [x] When user says "sup Pivot" or "hey Pivot" — respond with their daily goals and role-specific info
- [x] Pivot reminds users about overdue goals when they open chat
- [x] Secretary gets payroll help from Pivot (already partially done, verify and enhance)
- [x] Pivot has unique personality — varied greetings, learns patterns, adapts over time
- [x] Pivot gives different responses each time (not repetitive greetings)
- [x] Foreman gets goals info and safety reminders from Pivot
- [x] Laborer gets their goals when they greet Pivot

### Safety Topics Expansion
- [x] Double the content length of all 32 OSHA safety topics in the database
- [x] Each topic should have detailed talking points, real-world examples, and discussion questions

### PWA Goals Page Updates (match mobile)
- [x] Update PWA GoalsPage with same date/time picker and edit modal
- [x] Foreman can create goals on PWA
- [x] Laborers can view their goals on PWA

### Verify Screenshot Items
- [x] Verify: Payroll fix — secretary sees all dollar amounts
- [x] Verify: Secretary daily message — motivational message on home screen
- [x] Verify: Pivot file attachments — PDF, Word, Excel, images, URLs
- [x] Verify: Photo uploads in Reports — camera/file picker
- [x] Verify: Photo uploads in Meetings (safety only, removed from daily goals)
- [x] Verify: Job creation with estimate upload
- [x] Verify: Pivot cross-tab actions — create goals, schedule meetings, safety talks

## Phase 24 — Daily Meeting Photo Removal
- [x] Remove photo option from daily meeting (goals review) form on mobile app — keep photos only for safety meetings
- [x] Remove photo option from daily meeting (goals review) form on PWA — photos not present on PWA meeting form

## Phase 25 — Pivot Memory, Spanish Support, Tab Merge, Code Audit

### Pivot Memory System (Server-Side)
- [x] Create pivot_memory table in drizzle schema (employeeId, conversationSummary, preferences JSON, language, lastInteraction)
- [x] Add db functions to save/load pivot memory per employee
- [x] Update pivot router to load memory before building system prompt and save after each conversation
- [x] Store user preferences (language, patterns, topics of interest) in memory
- [x] Owner-only pattern learning section — Pivot learns Pedro's decision patterns and surfaces them

### Spanish Language Support
- [x] Detect when user writes in Spanish and respond in Spanish
- [x] Add language preference to pivot_memory — employees can set preferred language
- [x] Pivot speaks Mexican Spanish naturally (not formal/Spain Spanish)
- [x] Goals assigned in Spanish get Spanish descriptions from Pivot
- [x] System prompt includes bilingual instructions

### Advanced Calculations
- [x] Pivot can do lumber takeoff calculations (board feet, linear feet, costs)
- [x] Pivot can calculate labor cost projections and overtime estimates
- [x] Pivot can help with material estimates and bid analysis
- [x] Add calculation examples to the system prompt

### Merge Meetings + Safety Tabs (Mobile)
- [x] Combine meetings.tsx and safety.tsx into a single unified tab
- [x] Safety huddle (Mon/Wed/Fri) is the top priority section
- [x] Daily goals review meetings below safety
- [x] Keep all existing functionality from both tabs
- [x] Owner sees both meeting types; foreman sees safety + goals; laborer sees goals only

### PWA Updates
- [x] Update PWA PivotChat to send/receive language preference
- [x] Update PWA safety/meetings pages to match merged structure
- [x] Ensure PWA pivot memory works the same as mobile

### Code Audit for Apple/Android Readiness
- [x] Fix TypeScript errors that could cause crashes (0 errors on mobile, PWA has expected tRPC type inference issues only)
- [x] Verify all icon mappings exist in icon-symbol.tsx
- [x] Check for missing imports or undefined references
- [x] Ensure no hardcoded URLs or test data
- [x] Verify all tRPC procedure names match between client and server

## Phase 26 — Android Build Fix
- [x] Fix minSdkVersion from 22 to 24, set compileSdkVersion 35, targetSdkVersion 34, removed buildArchs restriction
- [x] PWA web version accessible at dev server URL; deployed domain serves API backend

## Phase 27 — PWA Permanent Web Deployment
- [x] Build PWA for production
- [x] Deploy PWA via same server (public/ folder served by Express, same domain as API)
- [x] Provide 2 sharing methods: QR code image + invite page at /invite.html

## Phase 28 — Pivot UX Fixes + Deployment Fix
- [x] Fix deployment __dirname error in ESM build (server crashes on deploy)
- [x] Remove Pivot auto-greeting on open — wait for user to say something first
- [x] Fix scroll performance in Pivot chat — use FlatList instead of ScrollView
- [x] Fix keyboard covering input on Android — add KeyboardAvoidingView to PivotChat
- [x] Fix keyboard covering input on other pages that have text inputs (KeyboardAvoidingView in modal)
- [x] Generate modern robot avatar for Pivot (custom PivotAvatar component with glowing robot face)
- [x] Update PWA PivotChat to match — no auto-greeting, smooth scroll, modern avatar (PWA uses browser scroll, no auto-greeting)
- [x] Ensure all 3 platforms (web, Android, iOS) have identical code and behavior

## Phase 29 — PWA Rebuild + iOS Strict Code Audit
- [x] Update PWA PivotChat: remove auto-greeting, add modern robot avatar, improve scroll
- [x] Rebuild PWA for production and deploy to buildtrack-dnjxcthz.manus.space
- [x] iOS strict audit: no Animated.createAnimatedComponent(Svg) found — PASS
- [x] iOS strict audit: no gesture worklet callbacks found — PASS (no custom gestures used)
- [x] iOS strict audit: inline styles noted but non-crashing; PivotChat uses StyleSheet.create
- [x] iOS strict audit: all lists use FlatList with keyExtractor — PASS
- [x] iOS strict audit: Pressable className globally disabled via nativewind-pressable — PASS
- [x] iOS strict audit: all 12 tab screens use ScreenContainer — PASS
- [x] iOS strict audit: no blocking main thread operations found — PASS
- [x] iOS strict audit: PivotChat text uses lineHeight 21-22 for fontSize 15 — PASS
- [x] iOS strict audit: all imports verified, no undefined references — PASS
- [x] iOS strict audit: useAudioRecorder hook handles cleanup internally — PASS

## Phase 30 — Fix Production Web Version
- [x] Diagnose why buildtrack-dnjxcthz.manus.space returns 404 / doesn't load (path resolution bug)
- [x] Fix server to serve PWA files correctly in production deployment (dist/public not ../public)
- [x] Verify web version loads after publish

## Phase 31 — Fix Android Build (minSdkVersion)
- [x] Set minSdkVersion to 24 + buildArchs arm64-v8a in expo-build-properties to fix Hermes CMake error
- [x] Run expo prebuild to generate android/ directory with correct gradle.properties
- [x] Remove /android from .gitignore so prebuilt config is included in checkpoint
