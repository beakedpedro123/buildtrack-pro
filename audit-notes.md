# Role-Based Visibility Audit — Apr 19, 2026

## Tab Visibility (from _layout.tsx)
| Tab | Owner | Office Mgr | Logistics | Foreman | Laborer |
|-----|-------|-----------|-----------|---------|---------|
| Home | ✅ | ✅ | ✅ | ✅ | ✅ |
| Jobs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Goals | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage | ✅ | ✅ | ✅ | ✅ (Crew) | ❌ |
| My Hours | ❌ | ❌ | ❌ | ✅ | ✅ |
| Messages | ✅ | ✅ | ✅ | ✅ | ✅ |
| Profile | ✅ | ✅ | ✅ | ✅ | ✅ |

## Data Access (from index.tsx, jobs.tsx, team.tsx, payroll.tsx)
| Data | Owner | Office Mgr | Logistics | Foreman | Laborer |
|------|-------|-----------|-----------|---------|---------|
| Dollar amounts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pay rates | ✅ | ✅ | ❌ | ❌ | ❌ |
| Budget details | ✅ | ✅ | ❌ | ❌ | ❌ |
| Budget alerts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Payroll | ✅ | ✅ | ❌ | ❌ | ❌ |
| Labor costs ($) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Labor hours | ✅ | ✅ | ✅ | ❌ | ❌ |
| All employees | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clocked-in status | ✅ | ✅ | ✅ | ❌ | ❌ |

## Server-Side Guards (from routers.ts)
- createEmployee: owner, office_manager, logistics ✅
- updateEmployee: owner, office_manager, logistics ✅
- deactivateEmployee: owner, office_manager, logistics ✅
- adjustTime: owner, office_manager, logistics, foreman ✅
- addManualTime: owner, office_manager, logistics ✅
- deleteTime: owner, office_manager, logistics ✅
- createKPI: owner, office_manager ✅
- createSafetyTopic: owner, office_manager, logistics ✅
- createSafetyMeeting: owner, office_manager, logistics, foreman ✅

## Manage Sub-Tabs (from manage.tsx)
| Sub-Tab | Owner | Office Mgr | Logistics | Foreman |
|---------|-------|-----------|-----------|---------|
| Team | ✅ | ✅ | ✅ | ✅ (Crew) |
| Meetings | ✅ | ✅ | ✅ | ❌ |
| Payroll | ✅ | ✅ | ❌ | ❌ |
| My Hours | ✅ | ✅ | ✅ | ✅ |

## Goals Privacy (from goals.tsx + routers.ts)
- Owner: sees ALL goals ✅
- Office Mgr/Logistics: sees ALL goals ✅
- Foreman: sees own goals + goals they created ✅
- Laborer: sees only their assigned goals ✅

## Issues Found: NONE
All role-based access controls are properly implemented across client and server.
