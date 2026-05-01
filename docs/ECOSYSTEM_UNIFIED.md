# BuildTrack Pro — Unified System Ecosystem

> Complete architecture reference showing all application modules, security controls, data flows, and external integrations operating as one unified system.

---

## System Overview

BuildTrack Pro is a full-stack construction management platform built on **Expo SDK 54** (React Native) with an **Express + tRPC** backend, **MySQL** database (Drizzle ORM), and **28 security controls** protecting every layer. The system serves 5 distinct user roles across iOS, Android, and Web platforms.

---

## Layer 1: Client Platforms

| Platform | Technology | Distribution |
|----------|-----------|--------------|
| iOS | Expo Go / EAS Build | TestFlight / App Store |
| Android | APK (EAS Build) | Direct install / Play Store |
| Web | Metro Bundler (Static) | buildtrack-dnjxcthz.manus.space |

All three platforms share 100% of the application code via Expo Router 6 with file-based routing.

---

## Layer 2: Application Modules (10 Tabs + Pivot AI)

| Module | Purpose | Key Features |
|--------|---------|--------------|
| **Home Dashboard** | Company overview | Weather, active jobs, budget alerts, daily message |
| **Time Clock** | GPS-verified clock in/out | Voice clock-out, lunch tracking, offline mode |
| **Team Management** | Employee CRUD | Roles, pay rates, certifications, job assignments |
| **Labor Costs** | Job costing dashboard | Per-job/per-employee breakdown, weekly trends, overhead rates |
| **KPI Tracking** | Performance metrics | Custom KPIs, history charts, targets |
| **Safety Meetings** | OSHA compliance | Topics, attendance, AI-generated toolbox talks |
| **Meetings & Goals** | Voice-to-goals | Recording, transcription, deadline tracking, Spanish support |
| **Daily Reports** | Field documentation | Photos, weather, crew, progress notes |
| **Profile & Settings** | Company config | Branding, trades, lunch rules, subscription |
| **Pivot AI Assistant** | Conversational AI | Voice/text, role-aware, memory, P&L analysis, scheduling |

### Pivot AI Capabilities

Pivot operates across all tabs with role-based access:

- **Owner**: Full financial analysis, P&L, cost projections, KPI creation, pattern learning
- **Office Manager**: Payroll calculations, report generation, scheduling
- **Foreman**: Crew management, daily report assistance, safety topics
- **Laborer**: Clock in/out, goal viewing, daily messages
- **All roles**: Voice input (EN/ES), conversation memory, contextual help

---

## Layer 3: Security Gateway (28 Controls)

Every request passes through a multi-layered security pipeline before reaching business logic.

### Request Pipeline (in order)

| # | Control | Implementation | Purpose |
|---|---------|---------------|---------|
| 1 | **Helmet CSP** | Per-request nonce, no unsafe-inline | XSS prevention |
| 2 | **CORS Whitelist** | Origin validation | Cross-origin protection |
| 3 | **Body Size Limit** | 10MB JSON, 50MB uploads | DoS prevention |
| 4 | **Per-User Rate Limiting** | 10 mutations/min per user | Quota exhaustion prevention |
| 5 | **Session Auth** | JOSE JWT (HS256, 7d expiry) | Identity verification |
| 6 | **Role-Based Access** | 5 roles with granular permissions | Least privilege |
| 7 | **Input Validation** | Zod schemas on all inputs | Injection prevention |
| 8 | **Prompt Length Cap** | 2000 char limit on AI inputs | Prompt injection mitigation |

### Data Protection

| # | Control | Implementation | Purpose |
|---|---------|---------------|---------|
| 9 | **AES-256 Encryption** | SSN encrypted at rest | PII protection |
| 10 | **PIN Hashing** | bcrypt with salt rounds | Credential security |
| 11 | **SSN Masking** | Only last 4 digits exposed via API | Data minimization |
| 12 | **PDF Error Masking** | Generic errors in production | Information leakage prevention |

### Monitoring & Forensics

| # | Control | Implementation | Purpose |
|---|---------|---------------|---------|
| 13 | **Security Audit Log** | All auth events logged | Intrusion detection |
| 14 | **Data Write Audit** | INSERT/UPDATE/DELETE tracked | Forensic traceability |
| 15 | **CSP Violation Reports** | /api/csp-report endpoint | XSS early warning |
| 16 | **Webhook Idempotency** | Event deduplication table | Duplicate prevention |

### Access Restrictions

| # | Control | Implementation | Purpose |
|---|---------|---------------|---------|
| 17 | **Admin IP Allowlist** | Configurable IP ranges | Admin lockdown |
| 18 | **Owner-Only Endpoints** | Role check on sensitive ops | Privilege escalation prevention |
| 19 | **Company Isolation** | companyId scoping on all queries | Multi-tenant data separation |
| 20 | **Session Invalidation** | Logout clears all tokens | Session hijacking prevention |

### Additional Hardening

| # | Control | Purpose |
|---|---------|---------|
| 21 | X-Content-Type-Options: nosniff | MIME sniffing prevention |
| 22 | X-Frame-Options: DENY | Clickjacking prevention |
| 23 | Strict-Transport-Security | HTTPS enforcement |
| 24 | Referrer-Policy: no-referrer | Information leakage |
| 25 | X-XSS-Protection: 0 | Legacy browser XSS (disabled, CSP handles it) |
| 26 | Permissions-Policy | Feature restriction |
| 27 | report-uri directive | Browser violation reporting |
| 28 | No server version headers | Fingerprinting prevention |

---

## Layer 4: API Server & Services

### Core Server

- **Framework**: Express 4 + tRPC 11.7
- **Language**: TypeScript 5.9 (strict, 0 errors)
- **Port**: 3000 (API), 8081 (Metro)
- **Architecture**: Procedure-based RPC with middleware chains

### Service Components

| Service | Technology | Responsibility |
|---------|-----------|----------------|
| **tRPC Router** | 40+ procedures | All business logic (CRUD, queries, mutations) |
| **PDF Generation** | Custom engine | Payroll, budget, field reports, job completion, labor cost, safety |
| **Email Service** | SMTP integration | Report delivery, notifications |
| **Push Notifications** | Expo Push API | Real-time alerts to crew |
| **File Storage** | S3-compatible | Photos, documents, report attachments |
| **Stripe Billing** | Webhooks + API | Subscription management, payment processing |
| **Lunch Deduction Engine** | Shared helper | Consistent lunch subtraction across all cost calculations |

### Lunch Deduction Consistency

The `deductLunch()` helper ensures identical calculations across:
- Dashboard labor costs (getLaborCostForJob)
- Per-job breakdown (getLaborCostByJob)
- Per-employee breakdown (getLaborCostByEmployee)
- Weekly trend charts (getWeeklyLaborCostTrend)
- Payroll PDF generation
- Pivot AI P&L analysis

Logic: Per-entry `lunchMinutes` takes priority → Company auto-deduction fallback (shift >= threshold, skip configured days).

---

## Layer 5: Data Layer

### Database: MySQL (Drizzle ORM)

**25+ tables** organized into 5 domains:

#### Core Business Tables
- `companies` — Multi-tenant company records with lunch/timezone settings
- `employees` — Crew members with roles, pay rates, encrypted SSN
- `jobs` — Active/completed projects with budgets and overhead rates
- `clockEntries` — GPS-verified time records with lunch minutes
- `expenses` — Job-linked expense tracking
- `budgetCategories` — Per-job budget line items
- `jobAssignments` — Employee-to-job mapping

#### Reporting Tables
- `dailyReports` — Field reports with weather/crew/progress
- `reportPhotos` — Photo attachments for reports
- `meetings` — Meeting records with transcriptions
- `weeklyGoals` — Employee goals with deadlines (EN/ES)
- `safetyMeetings` / `safetyTopics` — OSHA compliance tracking

#### AI & Memory Tables
- `pivotMemory` — Per-user conversation memory
- `pivotConversations` — Full chat history
- `tradeKnowledge` — Learned trade-specific data
- `tradeBenchmarks` — Industry pricing benchmarks

#### Audit & Security Tables
- `securityAuditLog` — Authentication and access events
- `dataAuditLog` — All write operations (INSERT/UPDATE/DELETE)
- `webhookEvents` — Stripe event deduplication
- `adminIpAllowlist` — Restricted admin access IPs

#### Billing & Support Tables
- `subscriptions` — Company subscription state
- `supportTickets` / `supportTicketReplies` — In-app support
- `knowledgeBase` — Help articles

---

## Layer 6: External Integrations

| Integration | Purpose | Security |
|-------------|---------|----------|
| **Stripe** | Payment processing, subscription webhooks | Webhook signature verification + idempotency |
| **AI Provider (LLM)** | Pivot completions, safety topics, meeting transcription | Prompt length cap, role-based context filtering |
| **Weather API** | Daily forecasts for job sites | API key rotation |
| **Expo Push Service** | Push notifications to crew devices | Server-side token management |
| **S3 Object Storage** | File uploads (photos, documents) | Signed URLs, size limits |

---

## Data Flow Summary

```
User Action → Client Platform → Expo Router → tRPC Client
    ↓
API Request → Helmet/CORS → Rate Limiter → Auth Middleware → RBAC Check → Zod Validation
    ↓
Business Logic → Drizzle ORM → MySQL (with audit logging)
    ↓
Response → JSON (or PDF/file stream) → Client
    ↓
(Async) → Push Notifications / Email / Webhook processing
```

---

## Role-Based Access Matrix

| Capability | Owner | Office Mgr | Foreman | Laborer | Subcontractor |
|-----------|-------|-----------|---------|---------|---------------|
| View all financials | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit pay rates | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage employees | ✅ | ✅ | ❌ | ❌ | ❌ |
| Clock in/out crew | ✅ | ✅ | ✅ | ❌ | ❌ |
| View own clock data | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pivot full access | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pivot voice (EN/ES) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Generate reports | ✅ | ✅ | ✅ | ❌ | ❌ |
| Safety meetings | ✅ | ✅ | ✅ | ✅ | ❌ |
| Company settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Billing/subscription | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Technology Stack Summary

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React Native 0.81, Expo SDK 54, TypeScript 5.9, NativeWind 4, Reanimated 4 |
| **Routing** | Expo Router 6 (file-based) |
| **State** | React Context, TanStack Query, AsyncStorage |
| **Backend** | Express 4, tRPC 11.7, TypeScript |
| **Database** | MySQL 8, Drizzle ORM 0.44 |
| **Auth** | JOSE JWT, bcrypt, AES-256 |
| **Security** | Helmet, CORS, Zod, custom rate limiter, audit logging |
| **Payments** | Stripe (webhooks + API) |
| **AI** | Server-side LLM integration (multimodal) |
| **Deployment** | EAS Build (iOS/Android), Static web export |

---

## Architecture Diagram

The full visual ecosystem diagram is available at: `/manus-storage/ecosystem-unified_677eb3a3.png`

---

*Last updated: April 30, 2026 — v7 (post-audit hardening + lunch deduction fix + PIN session auth)*
