# BuildTrack Pro API Endpoints

## Published Server URL
After publishing, the API server is available at:
`https://buildtrack-dnjxcthz.manus.space/api`

## Authentication
- All protected endpoints use `requireAuth` middleware
- Auth is cookie-based (session cookie from OAuth login or PIN-based login)
- Support portal uses company code + PIN authentication via `/api/trpc/employees.verifyPin`

## Key Endpoints

### tRPC API (main data API)
- `POST /api/trpc/{procedure}` — All tRPC procedures (companies, employees, jobs, clock entries, payroll, etc.)
- `POST /api/v1/trpc/{procedure}` — Same, versioned alias

### File Upload
- `POST /api/upload` — Upload files (requireAuth, multipart/form-data)

### PDF Reports
- `GET /api/payroll-pdf?startDate=&endDate=&companyId=` — Payroll PDF
- `GET /api/timecard-pdf?employeeId=&startDate=&endDate=&includeLunch=` — Individual timecard PDF
- `GET /api/budget-report-pdf?jobId=&startDate=&endDate=&includeLunch=` — Budget report PDF
- `GET /api/field-reports-pdf?jobId=&startDate=&endDate=` — Field reports PDF
- `GET /api/job-completion-pdf?jobId=` — Job completion PDF

### File Download
- `GET /api/download?key=` — Download uploaded files

### Stripe Billing
- `POST /api/stripe/create-checkout` — Create Stripe checkout session
- `POST /api/stripe/portal` — Create Stripe customer portal session
- `GET /api/stripe/status` — Get subscription status
- `POST /api/stripe/webhook` — Stripe webhook handler

### Web Pages (currently served by Express)
- `GET /api/web` — Marketing page
- `GET /api/web/admin` — Admin dashboard
- `GET /api/web/support` — Support portal
- `GET /api/web/app` — App login portal
- `GET /api/web/ticket/:token` — Ticket tracking

### Utility
- `GET /api/health` — Health check
- `GET /api/beam-diagram` — Beam diagram generator
- `POST /api/pivot-generate-schedule` — AI schedule generation
- `POST /api/csp-report` — CSP violation reports

## Support Portal Auth API
The support portal authenticates via:
```
POST /api/trpc/employees.verifyPin
Body: { companyCode: "xxx", pin: "1234" }
Response: { token: "session-token", employee: {...}, company: {...} }
```

## Admin Dashboard API
The admin dashboard uses these tRPC procedures:
- `admin.getStats` — Dashboard statistics
- `admin.getCompanies` — List all companies
- `admin.getTickets` — List support tickets
- `admin.updateTicket` — Update ticket status
- `admin.getKBArticles` — Knowledge base articles
- `admin.createKBArticle` — Create KB article
- `admin.getPivotLearnings` — Pivot AI learning data
- `admin.pivotChat` — Admin Pivot AI chat
- `admin.getChatHistory` — Chat history
