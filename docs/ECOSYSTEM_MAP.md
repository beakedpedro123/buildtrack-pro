# BuildTrack Pro — Complete System Ecosystem Map

> **Version:** 6.0 (Hardened)  
> **Last Updated:** April 30, 2026  
> **Total Components:** 6 layers, 40+ endpoints, 25+ database tables, 28 security controls  

---

## Visual Architecture

![BuildTrack Pro Full Ecosystem](/manus-storage/ecosystem-full_fed7ae26.png)

---

## System Architecture Overview

BuildTrack Pro is a full-stack construction management platform built for framing and steel erection crews. The system operates across three client platforms (mobile, web, APK), processes all requests through a unified security layer, serves business logic via a type-safe API, persists data in PostgreSQL with full audit trails, and integrates with external services for payments, weather, notifications, and AI inference.

---

## Layer 1: Client Platforms

The application is delivered across three platforms with full feature parity. All platforms share the same codebase via Expo and React Native, ensuring consistent behavior whether accessed on a phone, browser, or installed APK.

| Platform | Technology | Distribution |
|----------|-----------|--------------|
| **Mobile App** | Expo SDK 54 / React Native 0.81 | Expo Go (dev), APK (prod) |
| **Web App** | Metro Bundler / React Native Web | buildtrack-dnjxcthz.manus.space |
| **Android APK** | Production build | Direct install for crew devices |

---

## Layer 2: App Modules (10 Tabs)

Each tab represents a major functional domain of the application. Data flows in real-time between all modules via tRPC queries with automatic cache invalidation.

| Tab | Primary Function | Key Features |
|-----|-----------------|--------------|
| **Home Dashboard** | Overview & quick actions | Job cards, weather, daily positive messages, crew status |
| **Time Clock** | GPS-verified attendance | Clock in/out, lunch deductions, overtime calc, geofencing |
| **Team Management** | Employee administration | Profiles, roles, salary distribution across projects, certifications |
| **Jobs & Projects** | Project lifecycle | Budget tracking, status management, cost allocation, completion % |
| **Meetings & Goals** | Crew coordination | Safety toolbox talks, daily goals, voice recording, transcription → goals |
| **Safety** | Compliance & training | Toolbox topics library, meeting logs, compliance tracking |
| **Field Reports** | Daily documentation | Weather conditions, work performed, photo evidence, crew notes |
| **KPIs** | Performance metrics | Custom KPIs by category, progress tracking, target vs actual |
| **Labor Costs** | Financial analysis | Job costing, budget vs actual, cost per hour, financial graphs |
| **Profile & Settings** | Company configuration | Branding, trade setup, subscription management |

---

## Layer 3: Pivot AI Assistant

Pivot is the integrated AI assistant accessible from every screen via a single floating button. It supports text, voice, image, and camera input, and is role-aware (owner gets full financial analysis; foremen get scheduling; laborers get task guidance).

| Component | Function | Access |
|-----------|----------|--------|
| **LLM Engine** | Multimodal AI (text + image + audio analysis) | All roles (filtered by position) |
| **Voice Input** | Speech-to-text for hands-free operation | Owner, Office Manager, Foreman |
| **Knowledge Base** | Framing/steel expertise, Utah building codes, construction math | All roles |
| **Smart Scheduling** | Goal generation from meetings, deadline setting | Owner, Office Manager |
| **Financial Analysis** | Job costing, expense tracking, personalized financial goals | Owner only |
| **Pattern Learning** | Learns user patterns, pricing trends, speech patterns | Owner sees patterns |

**Pivot Capabilities by Role:**

| Role | AI Access Level |
|------|----------------|
| Owner | Full access: all tabs, financial analysis, pattern insights, KPI generation |
| Office Manager | Reports, scheduling, payroll assistance, microphone access |
| Foreman | Task guidance, safety topics, scheduling, microphone access |
| Laborer | Basic task guidance, clock reminders, goal viewing |

---

## Layer 4: Security Layer (28 Controls)

Every request passes through the security layer before reaching business logic. The layer is organized into five sub-systems that work in sequence.

### Request Flow Through Security

```
Client Request
    → Edge Protection (Helmet, CSP Nonce, CORS, Rate Limiting)
        → Authentication (PIN + bcrypt, Session Cookie verification)
            → Authorization (RBAC role check, assertRole guard)
                → Input Validation (Zod schema, prompt cap, file limits)
                    → API Router (business logic)
                        → Monitoring (audit log, CSP reports, request log)
```

### Security Sub-Systems

| Sub-System | Controls | Implementation |
|------------|----------|----------------|
| **Edge Protection** | Helmet.js, CSP with per-request nonce, CORS whitelist, Global rate limit (100/15min/IP), Per-user rate limit (10 mutations/min) | `server/_core/index.ts` |
| **Authentication** | PIN verification (bcrypt), HttpOnly/Secure/SameSite cookies, OAuth flow | `server/_core/cookies.ts`, `server/_core/oauth.ts` |
| **Authorization** | 5-role RBAC (Owner/Office Manager/Logistics/Foreman/Laborer), `assertRole` guards, companyId from session (tenant isolation) | `server/_core/trpc.ts`, `server/routers.ts` |
| **Input Validation** | Zod schemas on all mutations, 2000-char prompt cap, file type + size limits | `server/routers.ts` |
| **Monitoring & Audit** | CSP violation reporter (`/api/csp-report`), `data_audit_log` table (all writes), request logger (method/URL/status/duration) | `server/_core/index.ts`, `server/db.ts` |

---

## Layer 5: API Server (Express + tRPC)

The API layer handles all business logic through type-safe tRPC procedures. It also manages PDF generation, email delivery, and push notifications.

### Core Services

| Service | Technology | Endpoints |
|---------|-----------|-----------|
| **tRPC Router** | 40+ type-safe procedures | CRUD for all entities, AI queries, reports |
| **PDF Generation** | Custom PDF builders | Payroll, budget, field reports, job completion |
| **Email Service** | SMTP integration | Report delivery, notifications |
| **Push Notifications** | Expo Push API | Clock reminders, meeting alerts, goal deadlines |

### Key API Domains

| Domain | Operations | Protected By |
|--------|-----------|--------------|
| Employees | CRUD, salary config, role assignment | Owner, Office Manager |
| Jobs | Create, update status, budget management | Owner, Office Manager |
| Clock Entries | Clock in/out, GPS verification, lunch deduction | All roles (own entries) |
| Payroll | Period management, calculations, PDF export | Owner, Office Manager |
| Meetings | Create, transcribe, generate goals | Owner, Office Manager, Foreman |
| Safety | Topics CRUD, meeting logs | Owner, Office Manager, Foreman |
| Field Reports | Daily logs, weather, photos | All roles |
| KPIs | Create, track, update progress | Owner |
| Billing | Subscription check, plan management | Owner |
| Branding | Logo, colors, company info | Owner |

---

## Layer 6: Data Layer

All data is persisted in PostgreSQL via Drizzle ORM with parameterized queries (zero SQL injection risk). Every write operation is automatically logged to the audit table.

### Database Schema (25+ Tables)

| Category | Tables | Purpose |
|----------|--------|---------|
| **Core Business** | `employees`, `jobs`, `clock_entries`, `payroll_periods`, `expenses` | Primary operational data |
| **Meetings & Goals** | `safety_meetings`, `safety_topics`, `goals`, `punchlist_items` | Crew coordination |
| **Reports** | `field_reports`, `kpis` | Documentation & metrics |
| **Configuration** | `companies`, `trades`, `branding`, `lunch_settings` | Company setup |
| **Auth & Billing** | `sessions`, `subscriptions`, `webhook_events` | Access & payments |
| **Audit & Security** | `data_audit_log`, `webhook_events` | Forensic traceability |

### File Storage (S3)

| Content Type | Storage Method | Access Control |
|-------------|---------------|----------------|
| Employee photos | Signed upload URLs | Authenticated users only |
| Field report images | Signed upload URLs | Company members |
| Voice recordings | Signed upload URLs | Owner, Office Manager |
| PDF reports | Generated on-demand | Role-based download |

---

## External Integrations

| Service | Purpose | Security |
|---------|---------|----------|
| **Stripe** | Subscription billing, plan management | Webhook signature verification + idempotency keys |
| **Weather API** | Job site conditions for field reports | API key in env vars |
| **Expo Push** | Mobile notification delivery | Server-side token management |
| **AI Provider** | LLM inference, voice transcription, image analysis | Server-side API (no client keys exposed) |

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT (Mobile/Web/APK)                        │
│  Home │ Clock │ Team │ Jobs │ Meetings │ Safety │ Reports │ KPIs │
│                         ↕ Pivot AI (all screens)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (tRPC)
┌────────────────────────────┼────────────────────────────────────┐
│              SECURITY LAYER │                                     │
│  Helmet → CSP → CORS → Rate Limit → Auth → RBAC → Validation    │
└────────────────────────────┼────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                    API SERVER                                      │
│  tRPC Router → PDF Gen → Email → Push Notifications               │
└──────┬─────────────┬──────────────┬─────────────────────────────┘
       │             │              │
┌──────┴──────┐ ┌────┴────┐ ┌──────┴──────────────────────────────┐
│ PostgreSQL  │ │   S3    │ │     External Services                 │
│ 25+ tables  │ │  Files  │ │ Stripe │ Weather │ Expo │ AI Provider │
│ Audit Log   │ │ Photos  │ │                                       │
└─────────────┘ └─────────┘ └──────────────────────────────────────┘
```

---

## System Statistics

| Metric | Value |
|--------|-------|
| Total source files (server) | 18 TypeScript files |
| Total source files (frontend) | 40+ TypeScript/TSX files |
| TypeScript errors | 0 |
| tRPC endpoints | 40+ |
| Database tables | 25+ |
| Security controls | 28 |
| Security regression tests | 22 (all passing) |
| App tabs | 10 |
| User roles | 5 |
| External integrations | 4 |
| PDF report types | 4 |
| Supported languages | English, Spanish (Mexican) |
