# Backend Admin Route Completion Evidence

This reference records the backend-side admin route completion status for the BuildTrack Pro admin dashboard integration. It complements the dashboard checkpoint that aligned the login screen, bearer-token storage, favicon metadata, and package-compatible API contract.

## Summary

The backend source at `/home/ubuntu/buildtrack-pro-backend-src/server/adminRoutes.ts` now exposes the admin dashboard route set required by the dashboard console and preserves compatibility with both the current React dashboard and the uploaded legacy package contract. The login endpoint accepts either `key` or `adminKey` in the request body, verifies the configured admin credential, signs a time-limited admin token, and returns both `token` and `sessionToken` fields so either dashboard client can consume the session safely.

| Area | Backend evidence | Status |
| --- | --- | --- |
| Admin login | `POST /api/admin/login` accepts `key` and `adminKey`; response includes `token`, `sessionToken`, `expiresAt`, and user metadata. | Complete |
| Session verification | `GET /api/admin/verify` requires `Authorization: Bearer <token>` and returns a clean 401 expiry message when verification fails. | Complete |
| Session expiry | Tokens are signed with `ADMIN_SESSION_TTL_SECONDS` and expose an absolute `expiresAt` timestamp for clients. | Complete |
| Credential rotation | `POST /api/admin/change-key` requires an authenticated admin session, validates the current key, stores only the new hash, rotates the non-secret key ID, and returns `adminKeyId`. | Complete |
| IP allowlisting | `requireAllowedIp()` enforces `ADMIN_ALLOWED_IPS` when configured and audit-logs denied access. | Complete |
| Audit logging | Login, verification, support actions, Pivot actions, PIN actions, IP denials, and key rotation write audit events through `writeAudit()`. | Complete |
| Dashboard sections | Companies, support stats/tickets/replies/resolution, knowledge base, Pivot learning/chat/history, PIN management, company creation, and key rotation routes are registered. | Complete |

## Deployment Responsibilities

The source implementation is complete in the backend working tree, but live production behavior still depends on deploying this backend project and setting the correct environment variables. At deployment time, the backend must have a configured admin key source through either the environment-based or database-backed admin-key settings already supported by `adminRoutes.ts`. The dashboard must continue to target `https://buildtrack-dnjxcthz.manus.space` unless the production API domain changes.

The backend route set is protected by bearer-token authentication and optional IP allowlisting. If `ADMIN_ALLOWED_IPS` is set, only requests matching that allowlist will be accepted. If production users are denied unexpectedly, the allowlist should be adjusted rather than weakening the route-level authentication.

## Validation Coverage

The regression test `/home/ubuntu/buildtrack-pro-backend-src/server/adminRoutes.security.test.ts` asserts the completed contract at the source level. It covers package-compatible login payload aliases, dual `token` and `sessionToken` response fields, bearer-token verification, session expiry metadata, credential rotation behavior, IP allowlisting, audit logging, and the complete route list required by the dashboard.

## Latest Validation — 2026-05-09

The admin route security regression was updated to match the implemented `getBearerToken(req: Request)` helper and JOSE `.setExpirationTime(`${TOKEN_TTL_SECONDS}s`)` token expiry flow. This keeps the test focused on the actual bearer-token verification behavior instead of stale inline-header parsing strings.

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm vitest run server/adminRoutes.security.test.ts --reporter=verbose` | Passed | 1 test file passed; 5 admin route contract tests passed. |
| `pnpm check` | Passed | TypeScript completed with `tsc --noEmit`. |
| `pnpm build` | Passed | Backend bundle generated at `dist/index.js`. |
| `pnpm test -- --reporter=verbose` | Known unrelated failure remains | 14 files passed, 1 skipped, and 1 failed because `tests/phase7.test.ts` still expects `/home/ubuntu/construction-manager/assets/images/carranza-logo.png`, a legacy absolute asset path outside this backend source tree. |

The backend admin route code and security regression coverage are now validated locally. Production verification remains separate because it depends on live redeployment and production environment access rather than the local source tree.
