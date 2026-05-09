import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminRoutesSource = readFileSync(resolve(process.cwd(), "server/adminRoutes.ts"), "utf8");

describe("adminRoutes security and dashboard contract", () => {
  it("keeps admin login compatible with dashboard and uploaded package payload aliases", () => {
    expect(adminRoutesSource).toContain('app.post("/api/admin/login"');
    expect(adminRoutesSource).toContain('req.body?.key === "string"');
    expect(adminRoutesSource).toContain('req.body?.adminKey === "string"');
    expect(adminRoutesSource).toContain('return res.json({ success: true, ...signed, sessionToken: signed.token });');
  });

  it("requires bearer-token verification on protected admin routes and reports expiry cleanly", () => {
    expect(adminRoutesSource).toContain('app.get("/api/admin/verify"');
    expect(adminRoutesSource).toContain('function getBearerToken(req: Request)');
    expect(adminRoutesSource).toContain('const authorization = String(req.headers.authorization || "");');
    expect(adminRoutesSource).toContain('const match = authorization.match(/^Bearer\\s+(.+)$/i);');
    expect(adminRoutesSource).toContain('return jsonError(res, 401, "Admin session expired. Please log in again.");');
    expect(adminRoutesSource).toContain('const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;');
    expect(adminRoutesSource).toContain('.setExpirationTime(`${TOKEN_TTL_SECONDS}s`)');
  });

  it("protects credential rotation with current-key verification and returns a non-secret key id", () => {
    expect(adminRoutesSource).toContain('app.post("/api/admin/change-key"');
    expect(adminRoutesSource).toContain('verifyAdminToken(req)');
    expect(adminRoutesSource).toContain('const currentVerification = await verifyAdminKeyForAdmin(currentKey, admin);');
    expect(adminRoutesSource).toContain('await setSetting(adminHashSetting(admin.id), hashAdminKey(newKey));');
    expect(adminRoutesSource).toContain('await setSetting(adminKeyIdSetting(admin.id), newAdminKeyId);');
    expect(adminRoutesSource).toContain('return res.json({ success: true, message: "Admin key updated successfully.", adminKeyId: newAdminKeyId });');
  });

  it("keeps admin routes constrained by IP allowlisting and audit logging", () => {
    expect(adminRoutesSource).toContain("function requireAllowedIp()");
    expect(adminRoutesSource).toContain('process.env.ADMIN_DASHBOARD_ALLOWED_IPS || ""');
    expect(adminRoutesSource).toContain('await writeAudit({ eventType: "admin_login", result: "failure"');
    expect(adminRoutesSource).toContain('await writeAudit({ eventType: "admin_login", result: "success"');
    expect(adminRoutesSource).toContain('await writeAudit({ eventType: "admin_change_key", result: "success"');
    expect(adminRoutesSource).toContain("adminAuditLog");
  });

  it("covers the dashboard-supporting admin endpoints needed by the production console", () => {
    const expectedRoutes = [
      'app.get("/api/admin/companies"',
      'app.get("/api/admin/support/stats"',
      'app.get("/api/admin/support/tickets"',
      'app.post("/api/admin/support/tickets/:ticketId/reply"',
      'app.post("/api/admin/support/tickets/:ticketId/resolve"',
      'app.get("/api/admin/support/kb"',
      'app.post("/api/admin/support/kb"',
      'app.get("/api/admin/pivot/learning"',
      'app.post("/api/admin/pivot/learning"',
      'app.get("/api/admin/pivot/chat-history"',
      'app.post("/api/admin/pivot/chat"',
      'app.get("/api/admin/pin-management"',
      'app.post("/api/admin/pin-management/reset"',
      'app.post("/api/admin/pin-management/disable"',
      'app.post("/api/admin/pin-management/set-company"',
      'app.post("/api/admin/pin-management/company"',
    ];

    for (const route of expectedRoutes) {
      expect(adminRoutesSource).toContain(route);
    }
  });
});
