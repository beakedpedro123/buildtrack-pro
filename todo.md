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
- [x] Force minSdkVersion 24 in android/build.gradle ext block after expo-root-project plugin

## Phase 32 — Fix Production Web: Serve PWA via /api/web/
- [x] Discovered deployment platform only proxies /api/* to Express (non-API routes return Cloudflare 404)
- [x] Rebuild PWA with Vite base="/api/web/" so all asset paths use /api/web/ prefix
- [x] Add BrowserRouter basename="/api/web" for correct client-side routing
- [x] Serve PWA static files at /api/web/* route in Express server
- [x] SPA fallback for /api/web/* routes serves index.html
- [x] Verified all API calls use same backend as iOS/Android (buildtrack-dnjxcthz.manus.space/api/trpc)
- [x] PWA auth uses same employee selection as mobile apps
- [x] All data syncs to same database across web, Android, and iOS

## Phase 33 — Fix App Logo (Question Mark)
- [x] Verified BuildTrack Pro app icon exists (hardhat with checkmark)
- [x] All icon locations already have the correct 444KB icon file
- [x] Uploaded icon to S3 and added logoUrl to app.json extra section

## Phase 34 — Fix PWA Logo (Broken Image)
- [x] Found broken logo refs: /icons/company-logo.png doesn't work because only /api/* is proxied
- [x] Fixed paths to /api/web/icons/company-logo.png in Layout.tsx and LoginPage.tsx
- [x] Rebuilt PWA and server dist with correct paths

## Phase 35 — Fix Android Build minSdkVersion (Again)
- [x] Created withMinSdk24 config plugin that injects ext block before expo-root-project during prebuild
- [x] Plugin survives prebuild --clean regeneration
- [x] Verified: build.gradle has ext{minSdkVersion=24} BEFORE apply plugin: expo-root-project

## Phase 36 — PWA Feature Parity with Android
- [x] Add photo upload (file picker) to Daily Field Report form in PWA
- [x] Add photo upload to Meeting Document form in PWA (safety meetings)
- [x] Add "+ New Meeting" button and create meeting flow for foremen/office managers
- [x] Ensure all role-based access works (foreman, office manager can create reports/meetings)
- [x] Rebuild PWA with /api/web/ base path and deploy
- [x] Add photo upload to New Report creation modal (upload during creation)
- [x] Add Meetings quick action to foreman dashboard

## Phase 37 — Fix Android Build (minSdkVersion 22 vs 24 + NODE_ENV)
- [x] Fix minSdkVersion from 22 to 24 in all gradle/config files (build.gradle ext, gradle.properties, app/build.gradle)
- [x] Fix NODE_ENV environment variable missing during build (added env to eas.json)
- [x] Enhanced config plugin withMinSdk24 — now modifies build.gradle, app/build.gradle, AND gradle.properties
- [x] Hardcoded minSdkVersion 24 in app/build.gradle (no longer depends on rootProject.ext)
- [x] Verified android/ directory has correct settings after prebuild --clean
- [x] Save checkpoint and re-publish

## Phase 38 — Fix Deployed Web URL Returning "Not Found"
- [x] Diagnose why buildtrack-dnjxcthz.manus.space returns not found (root / not proxied to Express)
- [x] Fix server routing: added redirects from / and /api to /api/web/
- [x] Rebuilt server dist with redirect fix
- [x] Save checkpoint and re-deploy

## Phase 39 — Fix Persistent Android Build Failure (minSdkVersion 22 + NODE_ENV)
- [x] Investigated: all local files correct (24), build server somehow gets 22
- [x] Created scripts/fix-min-sdk.js nuclear fix that patches all gradle files
- [x] Added postinstall + eas-build-post-install hooks to auto-run fix after npm install
- [x] Created android/init.gradle to force minSdkVersion 24 at Gradle level
- [x] Also patches react-native version catalog as fallback
- [x] Save checkpoint and re-publish

## Phase 40 — DEFINITIVE Fix for Android Build (minSdkVersion 22 persists)
- [x] Analyzed build server behavior: Manus build runs prebuild which regenerates android/
- [x] Added settings.gradle override: catalog.version("minSdk", "24") in useExpoVersionCatalog
- [x] Added withDangerousMod to patch react-native version catalog TOML directly
- [x] Now 6 layers of defense: settings.gradle, build.gradle ext, app/build.gradle, gradle.properties, version catalog TOML, postinstall script
- [x] Verified all files correct after prebuild --clean
- [x] Saved checkpoint for re-publish

## Phase 41 — Fix Photo Upload on Deployed PWA
- [x] Photo uploads now working — user was using wrong URL
- [x] Correct URL: https://buildtrack-dnjxcthz.manus.space/api/web/

## Phase 42 — Fix Clock-In on Web + Pivot File Upload for Foremen
- [x] Fix clock-in not working on the PWA web version (clockInTime→clockIn, clockOutTime→clockOut, jobId required)
- [x] Add file/photo upload capability to Pivot chat for foremen (canAttachFiles: true)
- [x] Ensure foremen can upload documents and pictures when talking to Pivot
- [x] Hide job budget dollar amounts from foremen (show only percentage + progress bar)
- [x] Rebuilt PWA and deployed without breaking existing features

## Phase 43 — FINAL NUCLEAR Fix for Android Build minSdkVersion 22
- [x] Enhanced config plugin with 8 layers of defense
- [x] Added CMake arguments: -DANDROID_NATIVE_API_LEVEL=24 (directly tells CMake)
- [x] Added allprojects afterEvaluate to force minSdkVersion on ALL subprojects
- [x] Added settings.gradle gradle.beforeProject to set ext on every project
- [x] Added ext.minSdkVersion override AFTER expo-root-project apply
- [x] Nuclear postinstall script patches node_modules + android/ + gradle files
- [x] Verified zero traces of 22 in any file after prebuild --clean
- [x] Save checkpoint and re-publish

## Phase 44 — Fix PWA Clock NaN/Invalid Date
- [x] Fix "NaNh NaNm" display on clock page — time format parsing broken
- [x] Fix "Since Invalid Date" — clockIn timestamp not parsed correctly
- [x] Fix clock-in/out not working on web (iPad) — error message on submit
- [x] Ensure clock data syncs correctly between Android APK and web PWA

## Phase 45 — Fix PWA deployment: old cached bundle still serving
- [x] Verify deployment pipeline copies updated PWA to correct location
- [x] Force service worker cache bust so users get new code
- [x] Confirm clockInTime references are gone from production bundle

## Phase 46 — PWA UI Redesign to Match APK + Pivot AI Upgrade

### PWA UI Redesign (Match Android APK)
- [x] Study APK native screens: Dashboard, Clock, Jobs, Reports, Meetings, Pivot
- [x] Redesign PWA Dashboard to match APK card styles and layout
- [x] Redesign PWA Clock page to match APK
- [x] Redesign PWA Jobs page to match APK
- [x] Redesign PWA Reports page to match APK
- [x] Redesign PWA Meetings page to match APK
- [x] Match APK navigation, tab bar, and header styles
- [x] Match APK color scheme, typography, and spacing

### Pivot AI — Web Search Capability
- [x] Integrate web search API into Pivot backend
- [x] Pivot can look up real-time info (weather, material prices, code requirements)
- [x] Update all three versions (APK, PWA, iOS) with web search

### Pivot AI — Smoother Chat Interface
- [x] Redesign Pivot chat on PWA with polished message bubbles
- [x] Add typing indicators and smooth animations
- [x] Cleaner input area with attachment button
- [x] Match APK Pivot chat layout on PWA

### Pivot AI — Better File/Photo Sharing
- [x] Easier document and photo sharing in Pivot chat
- [x] Visual feedback from Pivot (formatted reports, tables, actionable items)
- [x] File sharing works across all three versions

### Pivot AI — Personal Growth Per Employee
- [x] Enhance Pivot memory to track personal preferences, communication style, work patterns per employee
- [x] Track personal interests/topics so Pivot remembers non-work conversations too
- [x] Make Pivot adapt tone and language per employee based on learned patterns
- [x] Each employee gets their own unique Pivot experience that evolves over time
- [x] Pivot proactively references past conversations and personal details naturally
- [x] Deeper relationship building — Pivot becomes each person's personal helper

## Phase 47 — Supercharge Pivot: Construction Reference Library

### AISC Steel Profiles Database
- [x] Compile W-shape steel profiles (W4-W44) with weight/ft, dimensions, area, moment of inertia
- [x] Include S, HP, C, MC, L, WT, MT, ST, 2L, HSS, PIPE shapes
- [x] Pivot can calculate total beam weight (e.g. W8x44 at 40ft = 1,760 lbs)
- [x] Pivot knows flange sizes, web thickness, depth for safety/rigging

### Simpson Strong-Tie Hardware Catalog
- [x] A35 clips, LUS26 hangers, HHUS410 hangers, and full catalog
- [x] Pivot can describe hardware, load ratings, installation requirements
- [x] Pivot can search and provide images of hardware from the web

### Utah Building Codes & Local Jurisdictions
- [x] Utah IRC/IBC residential and commercial codes
- [x] Summit County specific codes and requirements
- [x] Powder Mountain area codes
- [x] Morgan city/county codes
- [x] Layton city codes
- [x] Salt Lake City codes
- [x] Coalville city codes
- [x] Snow load, wind load, seismic requirements for each area

### Image Search & Visual Responses
- [x] Pivot can search for and return images of hardware, connectors, beam profiles
- [x] Provide visual references when employees ask about specific products

### Larger File/Video Uploads
- [x] Increase upload size limit for videos (200MB)
- [x] Pivot can accept and analyze video files from employees
- [x] Pivot can provide context videos in responses

### Additional Construction Knowledge
- [x] Lumber dimensions and grades reference
- [x] Common framing spans and load tables
- [x] Concrete mix ratios and curing times
- [x] Safety rigging weight calculations
- [x] Common construction math formulas

## Phase 48 — Goals Privacy, Sleek UI, Background Image, Pivot Images, Fixes

### Pivot Hardware Images
- [ ] Pivot can find and return images of hardware from the web when asked
- [ ] Image search integrated into Pivot tool calling

### Goal System with Privacy
- [ ] Anyone can set goals for anyone
- [ ] Users can only see goals they created or goals set for them
- [ ] Foremen cannot see goals other foremen set for their employees
- [ ] Owner account can see ALL goals across all employees
- [ ] Goal creation includes who set it and who it's for

### Goals Tab Revamp
- [ ] Sleek flashcard-style UI with no borders
- [ ] High-end look, smooth and modern
- [ ] Remove old bordered card style

### Pablo Carranza Fix
- [ ] Fix Pablo Carranza role to Office Manager (not owner)
- [ ] Ensure only Pedro is the owner account

### Home Screen Positive Message
- [ ] Add motivational/positive message on the home screen for Pedro

### Background Accent
- [ ] Create sleek gold streak/accent background mockups
- [ ] Show examples to user before applying
- [ ] Apply chosen gold accent design to main screen (no photo)

## Phase 48b — Gold Backgrounds, Tab Revamp, Full Audit

### Gold Backgrounds
- [ ] Generate blended gold wave + geometric backgrounds for each tab
- [ ] Home screen: curvy gold waves (B style)
- [ ] Other tabs: blend to subtle geometric gold lines (D style)
- [ ] Apply backgrounds to native app screens
- [x] Apply backgrounds to PWA screens

### Tab UI Revamp
- [ ] Revamp all tabs to high-end premium look
- [ ] Make tabs sleeker and more polished
- [ ] Consistent premium feel across all screens

### Full Audit
- [ ] Test all features on APK version for bugs
- [ ] Test all features on web version for bugs
- [ ] Fix any issues found during audit
- [ ] Optimize app performance

### Daily Positive Messages
- [ ] Add rotating daily positive messages for ALL roles (owner, secretary, foreman, laborer)
- [ ] Messages change daily, not just per session
- [ ] Owner gets unique motivational messages too

### iOS Update
- [ ] After this update, prepare iOS version update (Apple approved v23)

### Secretary → Office Manager Rename
- [x] Replace all user-facing "Secretary" labels with "Office Manager" across entire app
- [x] Check native app, PWA, and Pivot system prompts
- [x] Ensure Lupe Mejia and Pablo Carranza both show as Office Manager
- [x] Keep database enum as 'secretary' internally but display as "Office Manager"

## Phase 23 — Goals Privacy & Flashcard UI Redesign

### Goals Privacy System
- [x] Server-side privacy filtering: pass employeeId and employeeRole to goals.list API
- [x] Foremen only see goals they created or were assigned to them
- [x] Laborers only see their own assigned goals
- [x] Owner/management sees all goals with assignee filter
- [x] Privacy enforced both server-side and client-side

### Goals Flashcard UI (Native App)
- [x] Redesign goals cards to sleek borderless flashcard style
- [x] Left-edge priority accent strip (green/amber/red)
- [x] Translucent metadata pills (priority, status, assignee, deadline)
- [x] Premium shadow effects on cards
- [x] Borderless form inputs with surface backgrounds
- [x] Pill-style selectors for priority and status

### Goals Flashcard UI (PWA)
- [x] Redesign PWA goals page with matching flashcard style
- [x] Borderless cards with priority accent strips
- [x] Translucent metadata pills
- [x] Borderless form inputs and pill selectors
- [x] Privacy filtering with employeeId/employeeRole passed to API

### ImageBackground Fixes
- [x] Fix meetings.tsx missing opening ImageBackground tag
- [x] Fix safety.tsx missing opening ImageBackground tag in new meeting form
- [x] Fix safety.tsx missing opening ImageBackground tag in main list view
- [x] All ImageBackground tags balanced across all screens

## Phase 24 — Android Build Fix

### minSdkVersion Mismatch
- [x] Bump Android minSdkVersion from 22 to 24 (Hermes requires API 24+)
- [x] Patched ReactAndroid/build.gradle.kts with -DANDROID_PLATFORM=android-24 CMake arg
- [x] Patched hermes-engine/build.gradle.kts to hardcode minSdk = 24
- [x] Updated force-min-sdk-24.js to patch CMake args and Kotlin build files
- [x] Updated withMinSdk24.js config plugin with CMake ANDROID_PLATFORM override
- [x] Save checkpoint for rebuild

## Phase 25 — iOS TestFlight Submit Fix

### Missing Submit Profile
- [x] Add submit profile to eas.json for iOS TestFlight auto-submission
- [x] Save checkpoint

## Phase 26 — Nuclear Update (All Platforms)

### iOS TestFlight Submit Fix
- [x] Fix "Missing submit profile in eas.json: production" error properly
- [x] Ensure autoSubmit works for TestFlight uploads

### Clock In/Out — Bulletproof Rewrite
- [x] Fix clock in/out freezing on web/PWA version
- [x] Fix clock in/out freezing on iOS version
- [x] Ensure Android clock in/out continues working
- [x] Full audit of clock logic across all platforms

### Management Clock-In Time Editing
- [x] Add real-time clock-in time editing for management (owner/office manager)
- [x] Accessible from "Onsite Now" button on main page
- [x] Accessible from Clock In tab
- [x] Allow editing start time to actual arrival time
- [x] Server endpoint updateEntry added to clock router

### Goals Multi-Assign (Up to 5 People)
- [x] Expand goal assignment from single person to up to 5 people
- [x] Allow assigning 1 person or "everyone"
- [x] Update native app goals UI
- [x] Update PWA goals UI
- [x] Update server/database for multi-assign (creates individual goals per assignee)

### Pivot Interface Improvements
- [x] Fix keyboard issues (erasing text, not shrinking)
- [x] Make Pivot interface smoother
- [x] Add image generation for hardware questions (generate_hardware_image tool)
- [x] Ensure keyboard doesn't cover text box

### Full Web App Audit
- [x] Audit all PWA screens for bugs
- [x] Ensure clock in/out works flawlessly on web
- [x] Rebuild and redeploy PWA

## Phase 27 — EAS Build Fix

### iOS Build Error
- [x] Remove "autoSubmit" and "submitProfile" from eas.json (not allowed by EAS)
- [x] Save checkpoint so user can publish

## Phase 28 — Permanent Web Deployment & Full Audit

### Web Version 404 Fix
- [x] Diagnose why deployed domain shows "not found" (platform proxies /api/* only)
- [x] Fix server routing — PWA rebuilt with base=/api/web/, works at /api/web/
- [x] Verify PWA loads correctly at https://buildtrack-dnjxcthz.manus.space/api/web/

### Build Audit
- [x] Audit eas.json — clean, no disallowed fields
- [x] Audit TypeScript — 0 errors
- [x] Verify all clock-in fixes still intact in native and PWA code

### Permanent Deployment
- [x] Added server/ to Metro blockList to prevent EAS build failures
- [x] Cleaned up large bg_*.png files from public/
- [x] All 256 tests pass, 0 failures
- [x] iOS and Android exports bundle successfully locally
- [x] Save checkpoint and publish as permanent website

## Phase 29 — ClockShark-Style Time Editing + Web Fixes

### ClockShark-Style Time Editing (ALL versions)
- [x] Management can edit clock-IN time for any employee
- [x] Management can edit clock-OUT time for any employee
- [x] Management can change the JOB assignment on any clock entry
- [x] Editing available from Onsite Now section on home screen
- [x] Editing available from Clock tab
- [x] Editing available from any tab showing employee time
- [x] Server endpoint supports updating clockIn, clockOut, AND jobId

### PWA Clock Page — Delete and Rebuild from Scratch
- [x] Delete current broken PWA ClockPage
- [x] Rebuild with simple, non-blocking clock-in/out flow
- [x] No freezing, no stuck states, no lag on clock-out
- [x] ClockShark-style editing on web version too

### Web Safety Page Fix
- [x] Show full safety topic text for foreman to read (expandable view)
- [x] Allow adding new safety topics from web version
- [x] Log safety meeting feature shows complete topic content

### Build & Publish
- [x] Verify iOS export bundles clean (1709 modules, 0 errors)
- [x] Verify Android export bundles clean (0 errors)
- [x] Save checkpoint and publish

## Phase 30 — iOS Build Fix (metro.config.js)

- [x] Fix metro.config.js — anchored blockList to __dirname so /dist/ pattern doesn't block node_modules
- [x] Did NOT touch web or APK code
- [x] Verify iOS export bundles locally (1709 modules, 0 errors)
- [x] Save checkpoint for publishing

## Phase 30b — Fix Dependency Version Mismatches for iOS Build

- [x] Fix expo-location: upgraded via npx expo install --fix
- [x] Run npx expo install --fix — all mismatches resolved
- [x] Verify iOS export bundles cleanly (5.22 MB, 0 errors)
- [x] Save checkpoint

## Phase 31 — Comprehensive Timecard System & Clock Upgrade

### Server: Timecard API & Adjustment Tracking
- [x] Add timeAdjustments table to drizzle schema (entryId, fieldChanged, oldValue, newValue, adjustedBy, reason, createdAt)
- [x] Create getDetailedTimecard endpoint (daily breakdown for date range)
- [x] Create adjustEntry endpoint with mandatory reason and adjustedBy
- [x] Create getAdjustments endpoint (adjustment history per entry)
- [x] Return adjustment history with each entry in timecard

### Native App: Employee Timecard Screen
- [x] Build timecard detail screen at app/timecard/[id].tsx
- [x] Clickable employee names on payroll/dashboard/hours/team → opens their timecard
- [x] Daily breakdown: clock-in time, clock-out time, jobsite, total hours per day
- [x] Weekly/pay period totals with per-job breakdown
- [x] Date range selector (week, 2 weeks, month)
- [x] All employees can view their own timecard details
- [x] Management can view any employee's timecard

### Native App: Management Time Adjustment
- [x] Edit clock-in time on any entry (management only)
- [x] Edit clock-out time on any entry (management only)
- [x] Change jobsite assignment on any entry (management only)
- [x] Required reason field when adjusting any time entry
- [x] Show adjustment history (who changed what, when, and why)
- [x] Visual indicator on adjusted entries (edited badge)

### Native App: Smoother Clock-In/Out
- [x] Non-blocking UI during clock operations (already in place)
- [x] Better error handling and feedback
- [x] Android APK clock code untouched

### PWA: Matching Timecard System
- [x] Build PWA TimecardPage with same capabilities as native
- [x] Clickable employee names → timecard view (Dashboard, Payroll, Clock pages)
- [x] Management adjustment with required reason
- [x] Show adjustment history on PWA
- [x] Fix web clock-out lag with optimistic UI updates

## Phase 32 — Detailed Payroll PDF, Photo Upload Fix, Feature Parity

### Detailed Payroll PDF Report
- [ ] Build server endpoint to generate detailed payroll PDF
- [ ] Include employee name, role, hourly rate, daily breakdown
- [ ] Include exact clock-in/out times per day, job site per entry
- [ ] Include daily totals, weekly totals, period totals
- [ ] Include job cost breakdown per employee
- [ ] Secretary can download from payroll screen
- [ ] Custom date range picker (choose exact start/end dates) on payroll screen
- [ ] Date picker on native app payroll tab
- [ ] Date picker on PWA payroll page

### Fix Field Report Photo Upload (PWA + iOS)
- [ ] Audit PWA photo upload flow vs APK
- [ ] Fix PWA field report photo upload
- [ ] Ensure iOS photo upload works (check ph:// URI handling)

### Feature Parity: PWA + iOS match APK
- [ ] Audit all APK screens vs PWA screens for gaps
- [ ] Fix any missing or broken features on PWA
- [ ] Ensure iOS version matches APK behavior
- [ ] Rebuild and deploy PWA

## Phase 33 — PDF Report Type Selector
- [x] Server: Add reportType query param to /api/payroll-pdf (full, payroll, jobcost, employee)
- [x] Server: Generate only selected sections based on reportType
- [x] Native: Add report type picker on payroll screen before download
- [x] PWA: Add report type picker on payroll page before download
- [x] PWA: Rebuild and deploy

## Phase 34 — Pivot Goal Creation, Punch Lists, Keyboard Fix

### Pivot AI Goal/Punch List Creation
- [x] Pivot can create goals by command (e.g. "create goal for Lupe to finish framing by Friday")
- [x] Pivot can create punch list items by command
- [x] Pivot pushes goals/tasks directly to the goals system

### Punch List / Task List Per Job
- [x] Add punchListItems table to schema (jobId, area, description, completed, completedBy, createdAt)
- [x] Server endpoints: create/list/toggle/delete punch list items per job
- [x] Native: Punch list as secondary sub-tab under Goals tab with checkable items (like Apple Notes)
- [x] Copy/paste support for bulk adding items
- [x] Foreman can tap items to cross them off
- [x] Items organized by area within each job
- [x] Native: Add punch list items inline or via text area (multi-line paste)

### Fix Pivot Keyboard Overlap
- [x] Fix Pivot chat screen: keyboard pushes input off screen on mobile
- [x] Pivot interface and keyboard should adjust together to stay visible
- [x] Test on Android and iOS

### PWA Parity
- [x] PWA: Add punch list sub-tab under Goals page
- [x] PWA: Pivot goal creation support (server-side tools)
- [x] PWA: Rebuild and deploy

## Phase 35 — iOS Build Fix

### Metro Config Fix
- [x] Remove invalid `forceWriteFileSystem` option from metro.config.js (not a valid NativeWind 4.x option)
- [x] Convert scripts/load-env.js from ESM to CommonJS for EAS build compatibility
- [x] Verify metro.config.js loads successfully with Node.js
- [x] Verify iOS export bundles correctly (5.27 MB, 1711 modules)
- [x] Verify Android export bundles correctly (5.34 MB, 1711 modules)
- [x] TypeScript check: 0 errors

### Slug Mismatch Fix (iOS Publish Blocker)
- [x] Fix package.json name from "app-template" to "construction-manager" to match app.json slug and EAS projectId
- [x] Verified iOS export still works after change

## Phase 36 — Critical Fixes

### iOS Build Fix
- [x] Fix bundleIdentifier not being read in EAS production builds (created app.config.ts with hardcoded bundleIdentifier)

### Military Time → 12-Hour Format
- [x] Convert all time displays from 24hr military to 12hr AM/PM across native app
- [ ] Convert all time displays in PWA to 12hr AM/PM
- [ ] Ensure time pickers use 12hr format

### Time Adjustment Sync Bug
- [x] Fix: edited hours not updating/syncing correctly after time adjustment (added full cache invalidation)
- [ ] Ensure all screens (dashboard, payroll, hours, timecard) reflect adjusted times immediately

### Pivot Steel Tables Update
- [x] Update Pivot with comprehensive 2026 steel tables (947 shapes across 12 categories + plate/rebar/bolt/weld reference)
- [x] Updated construction-knowledge.ts to support all new categories (C, MC, L, HSS rect/sq/round, WT, M, pipe, plate, rebar, bolts, welds)

### Keyboard Overlap Fix (All Screens)
- [x] Audit all screens with text inputs for keyboard overlap issues
- [x] Fix keyboard overlap: added KeyboardAvoidingView to safety.tsx, clock.tsx, payroll.tsx, timecard/[id].tsx

### iOS Build Fix — app.config.ts removal
- [x] Removed app.config.ts entirely — EAS build server couldn't parse TypeScript import syntax, causing "config is not defined" error
- [x] app.json already contains all config (bundleIdentifier, slug, eas projectId, plugins, etc.) — no dynamic config needed
- [x] Verified: expo config reads correctly from app.json only, dynamicConfigPath is empty, iOS export clean

### Android APK Build Fix — minSdkVersion
- [x] Restored app.config.ts in exact Manus template format with all settings (bundleIdentifier, minSdkVersion 24, all plugins, eas projectId)
- [x] Config verified: bundleIdentifier, android.package, minSdkVersion 24, compileSdkVersion 35 all present

### Android Build Fix — Nuclear minSdkVersion 24 override
- [x] Added patch-min-sdk.js: patches CMakeLists.txt, version catalog, build.gradle in all native modules
- [x] Added gradleCommand with -PminSdkVersion=24 in eas.json production android config
- [x] Chained patch-min-sdk.js into postinstall, eas-build-post-install, expo-prebuild, preandroid hooks

### Web App Not Found Fix
- [x] Fix web app: root URL can't redirect (platform only proxies /api/*), correct URL is /api/web/

### Database Fix — Employee ID Disconnect
- [ ] Diagnose employee ID changes that disconnected clock entries from employees
- [ ] Reconnect clock entries to correct employees based on names/timestamps

## Phase 37 — Job Reconnect, Timesheet Fixes, Pivot Spacing

- [x] Reconnect jobs to clock entries (65 entries + 7 daily reports remapped to correct job IDs)
- [x] Fix Jose Marquina's corrupted 33hr 30min day entry (clockOut was 24hrs off, corrected to 9h 30m)
- [x] Add ability to add a full day to any employee's timesheet
- [x] Add ability to delete a day from any employee's timesheet
- [x] Fix Jose's updated hours not reflecting on actual time (manual add/delete now available)
- [x] Fix Pivot interface spacing — status bar/timer overlaps content on different devices (SafeAreaView padding added in Expo + env(safe-area-inset-top) in PWA)

## Phase 38 — Major Role System Overhaul

### Remove Secretary Role
- [x] Rename "secretary" to "office_manager" in database schema
- [x] Migrate existing secretary employees to office_manager role
- [x] Remove all "secretary" references from UI labels, role selectors, etc.
- [x] Office Manager gets same access as Owner (payroll, clock management, add/delete days, create employees, meetings, reports)

### Role Access Matrix Overhaul
- [x] Owner: Full access to everything, sees ALL goals, coordinates everything
- [x] Office Manager: Same as Owner for payroll, reports, meetings, clock mgmt, add/delete days, create employees
- [x] Logistics: No dollar amounts, no pay rates, no other employees' pay info
- [x] Foreman: Percentages only (no $), own goals + assigned goals, adjust hours, daily reports, voice-to-goals, NO meetings tab, punch list access
- [x] Laborer: See own goals, create daily reports, download weekly hours, see daily goals, use Pivot

### Tab Visibility per Role
- [x] Owner: All tabs
- [x] Office Manager: All tabs (same as owner)
- [x] Logistics: Remove payroll details, hide dollar amounts
- [x] Foreman: Remove meetings tab, keep punch list, daily reports, goals, clock
- [x] Laborer: Goals, daily reports, clock, hours, Pivot

### Personalized Daily Messages
- [x] Owner dashboard: personalized motivational/business messages
- [x] Office Manager dashboard: personalized office/operations messages
- [x] Logistics dashboard: personalized logistics/coordination messages
- [x] Foreman dashboard: personalized crew leadership messages
- [x] Laborer dashboard: personalized daily work messages (always changing)

### Spanish Language Support
- [x] Add language toggle (English/Spanish) in settings or profile
- [x] Translate key UI strings for Spanish-speaking laborers
- [x] Pivot AI responds in user's preferred language
- [x] Goals display in user's preferred language

### Pivot Personalization per Role
- [x] Owner: Full business AI assistant with all data access
- [x] Office Manager: Same as owner Pivot access
- [x] Logistics: Logistics-focused Pivot (no financial data)
- [x] Foreman: Crew management focused Pivot
- [x] Laborer: Personal work assistant Pivot with Spanish option

### Foreman Punch List Feature
- [x] Add punch list creation/management for foreman role (existing punch list feature available)
- [x] Keep voice-to-goals feature for foreman (remove meetings tab)

## Phase 39 — Timezone Fix & Platform Parity

- [x] Fix PDF reports to display times in Mountain Time (America/Denver) instead of UTC
- [x] Fix timesheet delete not working on Android — replaced iOS-only Alert.prompt with cross-platform modal
- [x] Fix timesheet adjust not working on iOS — modal already cross-platform, verified
- [x] Ensure delete and adjust features work identically on Android, iOS, and web — all use modal dialogs
- [x] Fix Pivot context dates to use Mountain Time
- [x] Fix goal deadline display to use Mountain Time

## Phase 40 — Final Polish & Publish Readiness

### Pivot Keyboard Fix
- [x] Fix Pivot chat input hidden behind keyboard on iOS and Android
- [x] Ensure keyboard avoidance works consistently on both platforms

### Team Tab — Real-Time Pay Editing
- [x] Allow owner/office_manager to edit employee pay rate inline from Team tab
- [x] Changes save immediately and reflect in real time

### Salary Pay for Office Managers
- [x] Add salary pay option (annual/monthly) for office managers and owner
- [x] Allow selecting up to 6 active projects to distribute salary cost evenly
- [x] Salary cost deducted from each selected project's budget proportionally

### Voice-to-Goals from Dashboard
- [x] Dashboard Goals button opens voice recording for goal creation
- [x] Voice recording → Pivot summarizes → user confirms → goals pushed to Goals tab
- [x] Keep existing copy/paste and type-to-create goals functionality
- [x] Voice option available for owner, office_manager, foreman

### Salary in Payroll Reports
- [x] Include salary employees in payroll report with their salary amounts
- [x] Include owner's own pay per project in payroll report

### Pivot Voice Recording Fix
- [x] Audit and fix Pivot voice recording UI/functionality
- [x] Improve Pivot overall experience (response quality, UI polish)

### Performance Optimization
- [x] Audit app for unnecessary re-renders, heavy components, memory leaks
- [x] Optimize/compress assets and reduce bundle size
- [x] Fix lag and freezing on both Android and iOS

### Publish Readiness Audit
- [x] Full audit for iOS App Store readiness
- [x] Full audit for Android APK readiness
- [x] Ensure all functions work identically on both platforms
- [x] Remove any dead code, unused imports, console.logs

### Goals UI Fix
- [x] Fix Goals UI — separate edit vs status toggle into distinct actions (tap = edit, separate status buttons)
- [x] Make status buttons (Not Started / In Progress / Complete) clearly labeled and always visible
- [x] Tap on goal card opens edit view, not status toggle

## Phase 41 — PDF Timezone Fix (Round 2) & Lupe Visibility Fix
- [x] Fix mysql2 timezone handling with timezone: "Z" option for consistent UTC across sandbox/deployed environments
- [x] Investigate and fix Lupe's visibility issue — APK was built from older code, current code is correct
- [x] Fix Lupe's dashboard showing 0 Employees, 0 On Site Now, 0 Workers, 0m Total Hours — code correct, needs APK rebuild
- [x] Add Payroll tab for Lupe (office_manager) — already in code, needs APK rebuild
- [x] Add Team tab for Lupe (office_manager) — already in code, needs APK rebuild
- [x] Ensure office_manager has same dashboard data access as owner — verified isManagement includes office_manager

## Phase 42 — Comprehensive Role Access Audit
- [x] Audit all employees/users in DB with their roles
- [x] Verify Owner (Pedro) sees all tabs, all data, dollar amounts, budget alerts
- [x] Verify Office Manager (Lupe/Pablo) sees same tabs as owner, payroll, team, all employees, dollar amounts
- [x] Verify Logistics (Alberto) sees team, jobs, reports, goals, meetings — NO dollar amounts, NO payroll
- [x] Verify Foreman (Ricardo, Juan) sees daily reports, goals, clock, hours — NO meetings, NO payroll, NO team
- [x] Verify Laborer sees goals, daily reports, clock, hours, profile only
- [x] Verify dashboard data loads correctly for each role (KPIs, labor overview, onsite now)
- [x] Verify profile screen shows correct data for each role
- [x] Fix: Added auto-refresh of employee data on app launch to sync stale cached roles
- [x] Verified Pablo Carranza is correctly office_manager (not owner)
- [x] Verified Pedro is the owner account
- [x] Investigate Lupe's cached auth data — confirmed stale cache is root cause, fixed with auto-refresh
- [x] Add auto-refresh of employee role on app launch to prevent stale cached roles

## Phase 43 — Biweekly Salary Allocation (Pablo & Lupe)
- [ ] Add salariedEmployees config: Pablo (ID=4) and Lupe (ID=5) each $2,500 biweekly / $5,000 monthly
- [ ] Add payPeriods table to DB: start date, end date, pay date, status
- [ ] Add salaryAllocations table: period, employee, amount, job allocations breakdown
- [x] Build backend endpoint to calculate and store salary allocations per period
- [x] Show salary costs in job budget deductions (alongside hourly labor)
- [x] Show biweekly salary line in payroll PDF summary — Pablo/Lupe show 'Biweekly Salary | $2,500.00'
- [x] Add salary badge in payroll screen UI for salaried employees
- [x] Remove CSV export from payroll screen (replaced by PDF reports)

## Phase 44 — Annual $2.5M Goal Plan (Pablo & Lupe)
- [x] Build $2.5M revenue model from 2025 baseline ($1.55M revenue, $158K profit)
- [x] Write 52-week Pivot goal schedule for Pablo and Lupe
- [x] Write 12-month milestone tracker
- [x] Write 4-quarter targets with KPIs
- [x] Fix gameplan PDF: correct invoice wording (request payment FROM GCs, not pay them)
- [x] Export final annual plan as PDF for upload to Pivot

## Phase 45 — One-Time Salary Adjustment (Mar 23 - Apr 4 Period)
- [x] Set Pablo and Lupe salaryAmount to $1,250 for current pay period report
- [x] Restore Pablo and Lupe salaryAmount to $2,500 starting Apr 6 new period — scheduled auto-restore at midnight Apr 6

## Phase 47 — Fix iOS Mic/Voice Input Across All Screens
- [x] Audit all mic/audio recording code (Pivot chat, meetings, voice goals)
- [x] Fix iOS voice recording transcription — MIME type audio/m4a → audio/mp4 across all 3 recording locations
- [x] Fix server transcribeVoice endpoint — proper error handling, returns actual error messages instead of swallowing them
- [x] Fix server transcribeAndSummarize endpoint — same error handling improvement
- [x] Add minimum recording duration check (800ms) to prevent empty audio uploads
- [x] Add console logging for upload/transcription debugging
- [x] Verify audio format is iOS-compatible (AAC in MP4 container via RecordingPresets.HIGH_QUALITY)
- [x] Verify setAudioModeAsync with allowsRecording:true is called before recording in all screens

## Phase 48 — Salary Restore, Android Job Creation Fix, Full App Checkup
- [x] Schedule salary restore to $2,500 for Pablo and Lupe at 6:00 AM MDT Apr 6
- [x] Fix Android job creation bug — fixed KeyboardAvoidingView behavior for Android, added bottom padding for Create button
- [x] Full checkup: Dashboard screen — no issues found
- [x] Full checkup: Jobs screen + Job Detail — fixed Haptics Platform checks, added try/catch on create, keyboardShouldPersistTaps
- [x] Full checkup: Clock screen — no issues found, solid error handling
- [x] Full checkup: Reports screen — fixed KeyboardAvoidingView for Android
- [x] Full checkup: My Hours screen — no issues found
- [x] Full checkup: Payroll screen — fixed KeyboardAvoidingView for Android
- [x] Full checkup: Team screen — fixed KeyboardAvoidingView for Android, added keyboardShouldPersistTaps
- [x] Full checkup: Meetings screen — fixed KeyboardAvoidingView for Android, added keyboardShouldPersistTaps
- [x] Full checkup: Goals screen — fixed KeyboardAvoidingView for Android
- [x] Full checkup: Profile screen — fixed KeyboardAvoidingView for Android
- [x] Full checkup: Pivot AI chat — already using padding behavior, no issues
- [x] Full checkup: Timecard detail / time adjustment — fixed KeyboardAvoidingView for Android
- [x] Fix KPIs screen — added Platform.OS checks on Haptics
- [x] Fix Safety screen — fixed KeyboardAvoidingView for Android
- [x] Fix Voice Goal Creator — fixed KeyboardAvoidingView for Android
- [x] Fix Invite screen — fixed KeyboardAvoidingView for Android
- [x] Fix Root Layout — fixed KeyboardAvoidingView for Android

## Phase 49 — Fix iOS Voice Transcription (Invalid File Format)
- [x] Fix Pivot voice recording on iOS — added magic bytes detection, URL extension fallback, default to m4a in server voiceTranscription.ts
- [x] Ensure iOS audio recordings are sent as m4a/mp3/wav format accepted by Whisper API
- [x] Add pull-to-refresh on Dashboard (index.tsx)
- [x] Add pull-to-refresh on Jobs screen
- [x] Add pull-to-refresh on Clock screen
- [x] Add pull-to-refresh on Reports screen
- [x] Add pull-to-refresh on Hours screen (already has onRefresh via FlatList)
- [x] Add pull-to-refresh on Payroll screen
- [x] Add pull-to-refresh on Team screen
- [x] Add pull-to-refresh on Meetings screen (already has onRefresh via FlatList)
- [x] Add pull-to-refresh on Goals screen (already has onRefresh via FlatList)
- [x] Add pull-to-refresh on Profile screen
- [x] Add pull-to-refresh on Safety screen
- [x] Add pull-to-refresh on KPIs screen
- [x] Add pull-to-refresh on Timecard detail screen

## Phase 50 — Tab Consolidation & Final Polish

- [x] Consolidate tab bar for management roles (Owner/Office Manager/Logistics) — reduced from 10 to 6 tabs
- [x] Create "Manage" tab with sub-tabs: Team, Meetings, Payroll, My Hours
- [x] Keep Goals as its own prominent tab for all roles
- [x] Foreman/Laborer tab layout unchanged (already clean)
- [x] All sub-screens support embedded prop to avoid double SafeArea wrapping
- [x] Final TypeScript check — 0 errors

## Phase 51 — Tab Merges, Clock-Out Fix, Team+Clock Unification

- [x] Fix clock-out UI refresh bug — fixed by invalidating queries before refetch, awaiting refreshAll
- [x] Merge Jobs + Reports into one tab with sub-tabs (Jobs | Reports) — created jobsreports.tsx
- [x] Merge Team + Clock into unified Team tab — inline clock-out buttons on each clocked-in employee row
- [x] Add floating action button for clock-in on Team screen — green stopwatch FAB
- [x] Add Employee button already exists at top of Team screen
- [x] Clock-in/out with full error handling, haptic feedback, query invalidation, and immediate UI refresh
- [x] Updated tab layout: Owner/OM/Logistics: Home, Jobs, Goals, Manage, Profile (5 tabs). Foreman/Laborer: Home, Jobs, Goals, My Hours, Profile (5 tabs)
- [x] TypeScript check — 0 errors

## Phase 52 — Camera Button + Performance Optimizations

- [x] Camera button in Pivot chat for photo capture on job site
- [x] Memoized PivotAvatar and MessageItem components to prevent unnecessary FlatList re-renders
- [x] Moved StyleSheet.create outside component render cycle (module-level)
- [x] Added global staleTime (30s) and gcTime (5min) to QueryClient defaults
- [x] Bumped clock crew polling from 20s to 30s

## Phase 53 — Crash Fix (iOS/Android)

- [x] Fix startup crash — staticStyles was referenced before declaration in pivot-chat.tsx (const hoisting issue)
- [x] Reordered module-level declarations: staticStyles now defined BEFORE MessageItem
- [x] TypeScript check — 0 errors
- [x] Full revert to last known working version (74db46b) — all 3 changed files (pivot-chat.tsx, _layout.tsx, clock.tsx) restored to the version that was working on devices
- [x] Camera button + performance optimizations will be re-applied carefully in a future phase

## Phase 54 — Camera Button + Performance (Safe Re-add)

- [x] Camera button (📷) added to Pivot input bar — minimal change, function + button only, no structural refactoring
- [x] takePhoto function inside component (same pattern as pickImage) with camera permission request
- [x] Global staleTime (30s) and gcTime (5min) added to QueryClient defaults in _layout.tsx
- [x] Only 2 files changed: pivot-chat.tsx (added function + button), _layout.tsx (added 2 lines to QueryClient)
- [x] No module-level refactoring, no StyleSheet moves, no memoization changes
- [x] TypeScript check — 0 errors

## Phase 55 — GPS Logging Bug

- [x] GPS permission is requested and location IS now logged on clock-in/clock-out (all paths)
- [x] Store GPS coordinates with each clock entry for job site verification

## Phase 56 — Enable File Attachments for Foreman & Laborer

- [x] Enable canAttachFiles for foreman role in ROLE_ACCESS
- [x] Enable canAttachFiles for laborer role in ROLE_ACCESS
- [x] TypeScript check passes

## Phase 57 — Fix 3 Critical Bugs

### Bug 1: Pivot can't access steel data
- [x] Enriched Pivot businessContext with per-job labor breakdown, full employee roster with rates, recent daily reports (last 14 days), and all material entries
- [x] Pivot now has access to all company data including steel, framing, and all trade-specific information

### Bug 2: Foreman clock-in button gives access to clock others
- [x] Foreman's personal Clock In button now shows inline job picker and clocks themselves in directly
- [x] Laborer's personal Clock In button also updated with same inline job picker
- [x] Crew Clock button on main screen remains separate — navigates to /manage for clocking others
- [x] Personal clock flow fully separated from crew clock flow

### Bug 3: Offline capabilities missing
- [x] Created data-cache.ts utility — caches jobs and employees to AsyncStorage with TTL
- [x] Rewrote offline-queue.tsx with real network detection (ping every 15s) instead of hardcoded isOnline=true
- [x] Clock screen uses effectiveJobs/effectiveEmployees fallback from cache when server data unavailable
- [x] Home screen uses effectiveMyJobs/effectiveActiveJobs fallback from cache
- [x] Auto-sync pending offline actions when connection is restored
- [x] TypeScript check passes with 0 errors

## Phase 58 — Fix Pivot Steel Data Access

- [x] Removed steel purchase/material data from Pivot's businessContext (Pedro erects steel, doesn't buy it)
- [x] Fixed lookupSteelProfile W-shape field name mismatch (weight_lb_ft→weight, d_in→depth, bf_in→width, etc.)
- [x] Pivot can now correctly answer "what's a W18x45?" using the AISC JSON data with real field names
- [x] Updated system prompt to clarify steel erection vs steel purchasing
- [x] Pivot can still identify beams from photos via vision + construction_lookup tool
- [x] TypeScript check passes with 0 errors

## Phase 59 — Steel Beam Cross-Section Diagrams in Pivot

- [x] Build server-side SVG generator for W-beam cross-section diagrams with labeled dimensions
- [x] Include: flange width (bf), depth (d), web thickness (tw), flange thickness (tf), area, weight/ft
- [x] Wire diagram generation into Pivot's construction_lookup tool for steel_profile lookups
- [x] Ensure diagram is returned as an image in Pivot's chat response via absolute URL
- [x] Support all 244 W-shapes in the AISC database
- [x] Fixed SVG XML encoding (font-family style attributes)
- [x] Beam diagram endpoint serves at /api/beam-diagram?designation=W18x50
- [x] Updated system prompt for all roles (owner, foreman, laborer) to include diagram in responses
- [x] GPS coordinates now captured on ALL clock-out paths (self clock-out, dashboard clock-out, job transfer)

## Phase 60 — Fix Pivot Steel Profile Lookup Bug

- [x] lookupSteelProfile returns "not found" for valid designations like W14x48
- [x] ROOT CAUSE: import.meta.dirname is undefined in tsx runtime, so data dir resolved to just "data" instead of "server/data"
- [x] FIX: Changed to process.cwd() + "server/data" for reliable resolution in both dev and production
- [x] Verified: lookupSteelProfile now correctly returns all W-shape data (936 total shapes loaded)
- [ ] Test steel lookup end-to-end via Pivot chat on deployed version

## Phase 61 — Comprehensive Steel Data + HSS Diagrams + App Optimization

### Steel Data Expansion
- [x] Audit current AISC database — found 936 shapes, HSS missing section properties
- [x] Added 12 new HSS rectangular + 11 new HSS round sizes for Utah residential
- [x] Added 13 steel deck profiles (B-Deck, N-Deck, Roof Deck)
- [x] Added Utah residential steel reference (seismic, snow loads, common sizes, connections, material grades)
- [x] Added section properties (Ix, Iy, Sx, Sy) to ALL HSS rect, square, round, and pipe shapes
- [x] Total: 959 structural shapes + deck + reference data

### HSS/Tube Cross-Section Diagrams
- [x] Built HSS rectangular/square SVG generator (green color scheme, hollow rect with rounded corners)
- [x] Built HSS round/pipe SVG generator (orange color scheme, concentric circles)
- [x] Wired into beam-diagram endpoint — auto-detects shape type (W, HSS rect, HSS square, HSS round, pipe)
- [x] Updated all system prompts (owner, foreman, laborer) to reference HSS diagrams
- [x] Tested all diagram types: W14x48, HSS8x6x3/8, HSS6x6x3/8, HSS6.625x0.375, PIPE 6 STD

### App Optimization
- [x] Compacted AISC JSON from 193KB to 115KB (minified separators, removed duplicate simpson data)
- [x] Removed 3 unused react-logo files (~42KB)
- [x] Truncated dev server log (992KB freed)
- [x] Identified duplicate icon files (8 copies of same icon) — kept for platform compatibility
- [x] Identified 4 stale public JS bundles (~3MB) — auto-generated, will be replaced on next build
- [x] TypeScript check: 0 errors
- [x] All beam diagram tests pass (7/7)

## Phase 62 — Fix Offline Mode + Remove GPS

### Remove GPS/Location Code
- [x] Remove all expo-location imports and permission requests
- [x] Remove GPS coordinate capture from clock-in, clock-out, job transfer
- [x] Remove latitude/longitude from all tRPC mutation calls (server routers.ts + db.ts)
- [x] Remove any location-related UI elements or error handling
- [x] Verified app.config.ts has no location permissions

### Fix Offline Mode
- [x] Cache jobs list to AsyncStorage when online (CACHE_KEYS.ACTIVE_JOBS)
- [x] Cache employees list to AsyncStorage when online (CACHE_KEYS.ALL_EMPLOYEES + LOGIN_EMPLOYEES)
- [x] Cache employee PINs locally for offline PIN verification (login.tsx rewritten)
- [x] Allow clock-in/out to work fully offline for ALL roles (removed manager-only restriction)
- [x] Show cached jobs in the Clock In Employee screen when offline (effectiveJobs fallback)
- [x] Show cached employees in the crew clock screen when offline (effectiveEmployees fallback)
- [x] Sync queued clock entries when connection is restored (existing syncPending works)
- [x] Show proper offline status and queued entry count (OfflineBanner component)
- [x] Fixed all 4 clock-out paths to not revert optimistic updates on network failure
- [x] Fixed job transfer to save to offline queue on failure

## Phase 63 — Fix Foreman/Laborer Clock-In + Offline Mode

### Foreman Clock-In Bug (Online)
- [x] Foreman sees "No assigned jobsites" — FIXED: getJobsForEmployee falls back to all active jobs
- [x] effectiveMyJobs triple fallback: myJobs → cachedMyJobs → activeJobs
- [x] activeJobs query now enabled for ALL roles (not just management)
- [x] All 5 roles can clock in with service

### Offline Mode (Complete Fix)
- [x] Offline-first pattern: check isOnline BEFORE calling server on all 6 clock paths
- [x] Mutation retry set to 0 so failures are instant (no 15s delay)
- [x] handleSelfClockIn: offline → addClockEntry directly
- [x] handleSelfClockOut: offline → skip server, keep optimistic
- [x] handleDashboardClockOut: offline → skip server
- [x] crew handleClockIn: offline → addClockEntry directly
- [x] crew handleClockOut: offline → skip server, keep optimistic
- [x] crew handleQuickClockOut: offline → skip server
- [x] crew handleJobTransfer: offline → queue new clock-in
- [x] Offline PIN verification uses cached employee PINs
- [x] Queued entries sync automatically when service returns

## Phase 64 — Critical Offline Bugs (FIXED)

### Corrupted Job Names
- [x] Job names display as single letters (C, E, H, M, R, S, U) in offline cache — FIXED: cache versioning (v2) in data-cache.ts clears old corrupted data on app update
- [x] Diagnose data-cache.ts serialization — was caching raw tRPC/superjson wrapper instead of deserialized array
- [x] Fix cache read/write to preserve full job objects — cache now stores deserialized arrays with version validation

### Offline Clock-In Doesn't Update Home Screen
- [x] After offline clock-in, home screen shows "Clocked In" immediately — FIXED: optimisticClockIn persists to AsyncStorage, ClockStateContext loads persisted state on mount
- [x] ClockStateContext smartFetch distinguishes network failure from "no active entry" — won't overwrite optimistic state when offline
- [x] Timer starts counting immediately after offline clock-in

### Offline Clock-Out Doesn't Work
- [x] All 6 clock-out paths now queue to offline queue: self clock-out, dashboard clock-out, crew clock-out, quick clock-out, job transfer clock-out, server-failure fallback
- [x] Queue clock-out in offline queue and update UI optimistically
- [x] Offline entries with id < 0 handled correctly (no longer blocked)

### Sync Issues
- [x] Auto-sync when connectivity returns — OfflineQueueProvider pings every 15s, syncs pending entries when online detected
- [x] After sync, utils.invalidate() refreshes all React Query caches automatically
- [x] App foreground event also triggers sync check
- [x] syncPending sends clockOut field in clock.in mutation — server handles both clock-in and complete entries

### "Unknown" Employee Names (Pre-existing Bug)
- [x] Server getClockedInEmployees() now returns fallback names: "Employee #N" for deleted employees, "Job #N" for deleted jobs
- [x] Client-side fallback in index.tsx On Site Now section: uses server join data (employeeName, employeeRole, jobName) with allEmployees lookup as secondary fallback
- [x] Removed dead fetchAndSync code from ClockStateContext (was unused, potential confusion)

## Phase 65 — Critical Bug Fixes (User Report Apr 9)

### Job Names Not Showing on Foreman Home Screen
- [ ] Job selector radio buttons show empty text — job names missing
- [ ] Diagnose: check how jobs are fetched and rendered in foreman/laborer home screen
- [ ] Fix job name rendering in the job selector list

### Offline Clock-Out Not Syncing to Server
- [ ] Ricardo clocked out offline, app showed "Clocked out (offline)" but server still shows him clocked in
- [ ] Diagnose: check syncPending — does it handle clock-out entries correctly?
- [ ] The offline queue stores entries with clockOut field, but sync may not be processing them as clock-outs
- [ ] Fix: ensure queued entries with clockOut actually close the server-side clock entry

### Updated Analysis (User Clarification)
- [ ] Job names blank on FRESH login — not a cache issue, happens for ALL profiles with service
- [ ] Clock-out said "offline" even with 5G service — connectivity check may be failing
- [ ] Need to fix connectivity check so it doesn't falsely report offline
- [ ] Need to ensure clock-out goes directly to server when online

## Phase 65 — Critical Bug Fixes

- [x] Fix job names blank on home screen job selector (all profiles) — cache v3, validation on read/write, safety filter on effectiveMyJobs
- [x] Fix offline clock-out sync: close original entry instead of creating duplicate
- [x] Add existingEntryId to OfflineClockEntry for clock-out-only sync
- [x] Update syncPending to call clock.out when existingEntryId is present
- [x] Add existingEntryId to all 8 clock-out paths: self, dashboard, crew, quick, job transfer (offline + catch)

## Phase 66 — Fix Timecard Payroll Period Logic

- [x] Fix payroll period calculation: biweekly starting April 6 (Mon) ending April 18 (Sat)
- [x] Paydays: April 10, April 24, May 8, etc. (every 2 weeks on Thursday)
- [x] 1 Week view: shows current week within payroll period (Week 1 or Week 2)
- [x] 2 Weeks view: shows full current payroll period
- [x] Add Previous/Next payroll navigation buttons to both My Hours and Timecard screens
- [x] Created shared lib/payroll-periods.ts utility with anchor date April 6, 2026
- [x] Updated hours.tsx and timecard/[id].tsx to use payroll period logic
- [x] payroll.tsx already had correct biweekly engine — no changes needed

## Phase 67 — Major Overhaul: Fix Clock System + Job Names (FIXED)

- [x] Fix job name corruption: cache v4 force-clears ALL old data, validates EVERY item in arrays, rejects names < 2 chars
- [x] Fix offline detection: removed ALL isOnline checks from clock-in/out — now ALWAYS tries server first, falls back to offline queue only on actual failure
- [x] Fix timer display: formatDuration now returns "0h 0m" for negative values (prevents -1h -1m)
- [x] Remove offline queue interference: isOnline no longer used in clock handlers (index.tsx + clock.tsx)
- [x] Clean up OfflineBanner: only shows when pendingCount > 0, no more false "offline" banner with 5G
- [x] All 8 clock paths updated: self clock-in/out, dashboard clock-out, crew clock-in/out, quick clock-out, job transfer — all try server first

## Phase 68 — Final Fix: Clock-Out Sync + Job Names + Timer

- [x] Fix: stale dashboard data — clear React Query cache on logout via globalQueryClient.clear()
- [x] Fix: created lib/query-client-ref.ts to avoid circular imports
- [x] Fix: allClockedIn query now staleTime=0, refetchInterval=15s, refetchOnMount/WindowFocus=always
- [x] Fix: job names — added String() wrapper, normalization with fallback to `Job #N`, flexShrink layout fix
- [x] Fix: applied same effectiveJobs normalization to clock.tsx
- [x] Verified: server clock.out mutation works correctly — updates clockOut field by entryId
- [x] Verified: syncPending calls clock.out when existingEntryId is present

## Phase 69 — Replace Job Selector with Simple Buttons

- [x] Remove broken radio button job selector from home screen
- [x] Replace with standalone JobPicker component that fetches its own data directly
- [x] JobPicker uses its own AsyncStorage cache (separate from data-cache.ts) with strict validation
- [x] Applied to both foreman and laborer views
- [x] Simple tappable buttons with job name as inline text — no flex tricks, no shrinking

## Phase 70 — Fix Missing Employee Names in Database

- [x] Look up employees #270005 and #270002 in database — confirmed these are ghost IDs (not real employees)
- [x] Identified 7 ghost employee IDs total: 90001, 240001, 270001, 270002, 270003, 270005, 270006
- [x] Deleted all 29 ghost clock entries — real employees already have correct hours
- [x] Verified: all 15 currently clocked-in employees now show real names

## Phase 71 — Fix Pivot Date/Timezone Issues

- [x] Investigate Pivot system prompt for date injection — no date was injected at all!
- [x] Fix timezone handling — added explicit Mountain Time date/time block to ALL system prompts (management, foreman, laborer)
- [x] Fix goals created by Pivot getting wrong dates — added year validation + auto-correction in create_goal handler
- [x] Fix weekOf calculation to use Mountain Time (noon UTC) instead of server EDT midnight
- [x] Updated create_goal tool description to include current year dynamically
- [x] Fix any existing goals with bad dates — corrected goal #630001 deadline from 2024 to 2026

## Phase 72 — Fix Goal Assignment & Add Repeating Goals

- [x] Fix "Everyone" goals not showing for all users — populated assignedToList with all active IDs, fixed 6 existing goals
- [x] Fix Pivot creating duplicate goals — added instruction to never create same goal twice
- [x] Add daily repeating goals feature — repeatDaily flag + server cron clones goals each morning
- [x] Ensure Pivot can reliably assign goals to specific people AND to everyone — assignToEveryone flag added
- [x] Management team needs Pivot to work for goal creation — updated system prompt with clear instructions

## Phase 73 — Fix Office Manager Salary Back to $2,500 Biweekly

- [x] Check current salary for Pablo Carranza and Lupe Mejia in database — was $1,250.00
- [x] Update salary to $2,500 biweekly — both updated in database
- [x] Verify payroll report shows correct $2,500 for a full pay period — confirmed via API

## Phase 74 — Fix "No Active Jobs Available" on Clock Screen

- [ ] Investigate why jobs list returns empty for Carlos, Jose, Isidrio
- [ ] Check jobs table status values and clock screen filtering logic
- [ ] Fix the issue so all employees see active jobs
- [ ] Verify for every employee account

## Phase 74 — Fix 5 Critical Clock/Payroll Issues

- [ ] 1. Add retry mechanism for jobs.listActive query
- [ ] 2. Improve offline detection accuracy (false offline when has service)
- [ ] 3. Match and eliminate "Unknown" entries in payroll — find ghost employee IDs
- [ ] 4. Prevent duplicate clock entries from offline sync (server-side dedup)
- [ ] 5. Fix time adjustment/manual entry timezone bug (3:03 AM instead of correct time)

## Phase 74b — Jobs Budget Display + Collapsible Employee Section

- [x] Fix Jobs tab showing $0 budget on job cards — server now returns spentAmount (labor + expenses) with jobs.list and jobs.listActive
- [x] Make 'By Employee (This Week)' section collapsible on home screen — tap header to expand/collapse with haptic feedback

## Phase 80 — Pedro's April 18 Feature Requests

### Report PDF Fixes
- [x] Fix stacked/overlapping employee names in JOB COST SUMMARY PDF column
- [x] Eliminate blank pages at end of generated PDF reports
- [x] Add company logo to PDF report pages
- [x] Fix page number mismatch in PDF footer

### Hourly Job Billing
- [x] For jobs with no budget (hourly jobs): show total hours per employee per job
- [x] Add rate selector ($45/$50/$55/$60 per hour) for hourly job billing
- [x] Office manager salary ($2,500) spread evenly across all active jobs in reports

### Employee Features
- [x] Allow employees to download individual timecards
- [x] Add PIN change screen accessible from Profile for all users (already existed)

### Report Management
- [x] Add "Seen by Owner" checkbox on reports so employees know Pedro reviewed them

### Offline Data
- [x] Expand offline caching to cover reports, goals, jobs (not just clock entries)

### Data Integrity (from audit)
- [x] Diagnose and reconnect orphaned clock entries from employee ID changes (DB clean)
- [x] Salary allocation handled in PDF generator (no separate tables needed)
- [x] Match and eliminate "Unknown" ghost employee entries in payroll (DB clean)

### Pivot AI Upgrades
- [x] Pivot can push daily repeating goals
- [x] Pivot enforces mandatory clock-in/clock-out goals
- [x] Pivot generates reports by voice command
- [x] Pivot creates clock-ins by voice command
- [x] Pivot creates punch list items by voice command
- [x] Pivot interacts with all app functions (goals, clock, reports, payroll)

### Code Quality
- [x] Full code audit — removed 3 unused components, cleaned 40+ console.logs
- [x] Optimize performance — added pull-to-refresh to labor-costs, verified all screens
- [x] Ensure all data syncs and refreshes properly — 95 invalidation calls verified

### Future: Document Upload
- [ ] (Question answered) Support uploading paystubs, workers comp, liability docs to database for budget tracking

### Per-Job Reports (Pedro April 18 update)
- [x] Per-job report download — download PDF report for a specific individual job
- [x] Billing rate selector ($45/$50/$55/$60) for hourly/no-budget jobs in PDF reports
- [x] Office manager salary ($2,500) split evenly across ALL active jobs in reports

## Phase 81 — Multi-Trade Expansion & Multi-Tenant Planning (Pedro April 18)

### Goals UI
- [x] Add repeat on/off toggle when creating a goal in the goals tab

### Competitor Research
- [ ] Research Jibble features and pricing for multi-trade coverage
- [ ] Research ExakTime features and pricing
- [ ] Research FingerCheck features and pricing
- [ ] Identify features from each competitor to incorporate

### Multi-Trade Adaptive System
- [ ] Design AI-driven trade detection and adaptation (excavators, concrete, drywall, landscaping, plumbing, electrical)
- [ ] Adaptive report templates per trade
- [ ] Adaptive checklists and safety items per trade
- [ ] Adaptive terminology per trade

### GPS Add-On
- [ ] Design GPS as optional paid feature (not included in base plans)

### Admin Web App (Separate from BuildTrack Pro)
- [ ] Design separate admin web app for subscription management and troubleshooting
- [ ] Secretary can manage billing, view subscriber metrics, troubleshoot

### Updated Pricing
- [ ] Starter: $49/mo, 8 employees, +$6/user
- [ ] Pro: $99/mo, 18 employees, +$5/user
- [ ] Premium: $199/mo, 100 employees, +$4/user

### Build Instructions
- [ ] Write comprehensive build instructions for multi-tenant conversion
- [ ] Get Pedro's approval before starting build

## Phase 82 — Marketing, Time Fix, Offline Fix, Multi-Tenant Plan Update
- [ ] Fix time adjustment UI: add date picker (select exact day) + hour/minute picker with AM/PM
- [x] Fix offline caching — screen recording shows nothing loading offline
- [ ] GPS included in app but toggle-able per company (on/off in company settings)
- [ ] Build marketing/signup website for buildtrackpro.com with screenshots and pricing
- [ ] Create English marketing presentation for business owners
- [ ] Create Spanish marketing presentation for business owners
- [ ] Create short English marketing video for small contractors
- [ ] Create short Spanish marketing video for small contractors
- [ ] Write updated multi-tenant build plan with GPS toggle, trade adaptability, updated pricing
- [ ] Remove paystubs feature from plan (Pedro no longer wants it)


## BuildTrack Pro SaaS Platform (Separate Project)

- [x] Initialize standalone SaaS project (marketing site + multi-tenant server)
- [x] Build multi-tenant database schema (companies, users, subscriptions, tenant isolation)
- [x] Build marketing landing page with BuildTrack Pro dark+gold branding
- [x] Integrate Stripe billing (products, checkout, webhooks, subscription management)
- [x] Build company signup flow (Stripe payment → auto-provision tenant)
- [x] Connect marketing site to multi-tenant server for seamless onboarding

## Private Pivot Knowledge Base

- [x] Create private Pivot knowledge base for Pedro's financial data (owner-only)
- [x] Wire Pivot AI to reference knowledge base for personalized goals and job costing
- [x] Ensure no employee/customer can see Pedro's private financial data

## Hourly Job Type Feature
- [x] Add job billing type (hourly vs fixed budget) to job schema
- [x] Update job creation/edit UI to support hourly jobs (no budget field, toggleable rate: $45/$50/$55/$60 per person)
- [x] Auto-calculate revenue for hourly jobs (workers x hours x hourly rate)
- [x] Update job detail screen to show hourly revenue instead of budget progress for hourly jobs
- [x] Update job cards to show hourly rate badge and revenue for hourly jobs
- [x] Add billing settings section to job detail (toggle billing type + rate selector)
- [x] Wire Pivot AI with hourly billing intelligence (revenue, margin, rate comparison)
- [x] Add job billing types to Pivot's business context data

## Marketing Short Videos (40-second social media shorts)
- [x] Capture clean slide screenshots from EN and ES presentations
- [x] Write 40-second voiceover scripts (English + Spanish)
- [x] Generate AI voiceover audio for both languages
- [x] Build English 40-second video (slides + app screenshots + Pedro's footage + voiceover)
- [x] Build Spanish 40-second video (slides + app screenshots + Pedro's footage + voiceover)

## Bug Fixes (Apr 19, 2026)
- [x] Fix employee report download error — "Cannot read property 'openURL' of undefined" when employee tries to generate hours report
- [x] Fix salary employees showing full pay on job budget in report upper section — should show allocated portion per job, not entire salary

## Phase 83: Deep Audit + Report Download Fix + Free Trial Flow (Apr 19, 2026)
- [x] Fix employee report download — still broken on TestFlight (openURL error persists after previous fix) — root cause: dynamic import of oauth module triggered expo-linking load which shadowed react-native Linking; fixed with static import
- [x] Research competitor apps (Jibble, ExakTime, Busybusy, ClockShark, Connecteam) for feature comparison
- [x] Full function-by-function audit of every screen in the app
- [x] Write comprehensive audit report with competitor insights and improvement suggestions
- [x] Design free 14-day trial flow for SaaS server (signup → trial → purchase → auto-upgrade)
- [x] Design subscription sync so trial users seamlessly upgrade when they pay
- [x] Build trial signup API (POST /api/trial) — creates company + owner + 14-day Pro trial
- [x] Build trial status API (GET /api/trial/status) — shows days remaining, expiration
- [x] Build trial upgrade API (POST /api/trial/upgrade) — redirects to Stripe checkout
- [x] Update marketing site signup form with proper fields (first/last name, company, email, password)
- [x] Wire Stripe webhook to auto-detect trial upgrades and convert to paid

## Phase 84: Job Selector UI Improvement (Apr 19, 2026)
- [x] Redesign job site selector on home screen — collapsible accordion, polished dark+gold styling
- [x] Make job list compact by default, expand on tap
- [x] Better visual hierarchy and seamless look

## Marketing Website Integration (Web App)

- [x] Copy all marketing assets (images, mockups, HTML) into public/marketing/
- [x] Update marketing HTML API paths for /api/marketing-* prefix
- [x] Create marketing-db.ts (SQLite multi-tenant database for signups/subscriptions)
- [x] Create marketing-stripe.ts (Stripe checkout, billing portal, webhooks)
- [x] Create marketing-routes.ts (all SaaS API endpoints)
- [x] Register marketing routes in server/_core/index.ts
- [x] Install dependencies (better-sqlite3, bcryptjs, jsonwebtoken, uuid, stripe, cookie-parser)
- [x] Verify marketing site renders at /api/marketing/ with all sections
- [x] Verify trial signup API creates accounts with 14-day trial
- [x] Verify lead capture API works
- [x] Verify root URL redirects to marketing site
- [x] Verify success.html page serves correctly
- [ ] Configure Stripe keys when Pedro purchases Stripe account
- [ ] Point buildtrackpro.com domain when purchased

## Phase 85: Pivot Budget Numbers Bug (Apr 19, 2026)
- [x] Fix Pivot not recalling specific budget numbers from uploaded knowledge base data
- [x] Verify Pivot can answer questions about specific dollar amounts from uploaded data

## Phase 86: Marketing Site Updates (Apr 19, 2026)
- [x] Remove Pedro's name from marketing site (verified: no personal names on public-facing pages)
- [x] Regenerate social media visuals using real app screenshots
- [ ] Build marketing site as publishable web app with permanent URL

## Phase 87: Multi-Tenant Support Dashboard (Apr 19, 2026)
- [ ] Research ClockShark, Jibble, Buildertrend, QuickBooks support workflows
- [ ] Build admin support dashboard for team to troubleshoot customer accounts
- [ ] Connect marketing site signups to multi-tenant server
- [ ] Support team can view/manage all customer company accounts
- [ ] Support team can help customers with crew management issues

## Phase 88: Major UI Redesign & Feature Update (Apr 19, 2026)

### UI Redesign — Sleek & Collapsible
- [x] Remove boxes from job list on clock-in screen, make it collapsible and sleek
- [x] Make budget alerts section collapsible on owner dashboard (handles multiple alerts)
- [x] Make weekly trend section collapsible on owner dashboard
- [x] Overall sleek, high-end, seamless design across all account types

### Dashboard Interactivity — Tappable Icons
- [x] Make Active Jobs stat icon tappable → links to Jobs tab
- [x] Make On Site Now stat icon tappable → links to employees on site
- [x] Make Employees stat icon tappable → links to employee management
- [x] Link budget alerts to budget details when tapped

### Profit Tracking on Hourly Jobs
- [x] Show profit on hourly jobs (revenue vs labor cost)
- [x] Display profit metrics on dashboard or job details

### Messaging/Notes System
- [x] Build messaging system: send text messages/notes
- [x] Support picture attachments in messages
- [x] Support PDF/plan set attachments in messages
- [x] Allow assigning messages to 1-5 specific people or whole company
- [x] All users can send messages (not just owner)
- [x] Pivot can push messages/notes like goals across accounts

### Role-Based Dashboard Content
- [x] Workers/Foremen: replace jobs list at bottom with high-end construction calculator + compass
- [x] Secretary/Office Manager: show budget alert notifications
- [x] Ensure each role only sees what they're supposed to see

### Pivot Enhancements
- [x] Give Pivot access to Google (web search capability)
- [x] Tailor Pivot responses to user's specific position/role
- [x] Allow Pivot to push messages/notes across accounts like goals

### Account Sync & Role Verification
- [x] Verify all accounts are synced properly
- [x] Verify role-based visibility is correct for each position
- [x] Ensure owner-only data stays owner-only

### Final Audit
- [x] Audit sync functionality across all accounts
- [x] Audit caching for offline use
- [x] Audit refresh and data fetching
- [x] Code optimization and compression
- [x] Check all functions work end-to-end
- [x] Add high-end construction + payroll calculator for ALL roles (accessible from dashboard)
- [x] Redesign job buttons/list on main screen for ALL roles (sleek, no boxes, modern)
- [x] Add work items to Daily Field Report: Roof Sheathing, T&G Siding, Interior Finish Work, Finished Facia, Exterior Soffit, Interior Soffit, Demo, Shim and Shave
- [x] Make Work Completed checklist collapsible in Daily Field Report
- [x] Consolidate Pivot 3 attachment buttons (camera, image, paperclip) into single + button with expandable menu
- [x] Improve Pivot input bar layout — wider text field, less cramped
- [x] Add real-time budget editing on job detail screen (owner/office_manager only)
- [x] Add server-side updateJobBudget mutation with role guard
- [x] Add change orders DB schema (changeOrders table)
- [x] Add change orders DB functions (create, list, delete)
- [x] Add change orders server routes with role guards
- [x] Add inline budget editing on job detail (owner/office_manager)
- [x] Add change orders UI section on Jobs budget tab
- [x] Change orders auto-adjust the effective budget total
