import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const adminRoutesPath = path.join(repoRoot, "server", "adminRoutes.ts");
const dbPath = path.join(repoRoot, "server", "db.ts");

describe("Admin employees endpoint coverage", () => {
  it("registers the canonical /api/admin/employees endpoint with admin-session and audit coverage", () => {
    const content = fs.readFileSync(adminRoutesPath, "utf-8");
    const routeSection = content.match(/app\.get\("\/api\/admin\/employees"[\s\S]*?\n\s*\}\);/);

    expect(routeSection).not.toBeNull();
    expect(routeSection![0]).toContain("requireAdminSession(req, res, \"admin_employees_list\")");
    expect(routeSection![0]).toContain("listAdminPinManagement()");
    expect(routeSection![0]).toContain("employees: data.employees");
    expect(routeSection![0]).toContain("writeAudit");
  });

  it("keeps PIN-management listing tolerant of camelCase and snake_case production schemas", () => {
    const content = fs.readFileSync(dbPath, "utf-8");
    const helperSection = content.match(/export async function listAdminPinManagement\(\)[\s\S]*?\n\}/);

    expect(content).toContain("function firstExistingColumn");
    expect(content).toContain("function selectColumnExpression");
    expect(helperSection).not.toBeNull();
    expect(helperSection![0]).toContain('["companyId", "company_id"]');
    expect(helperSection![0]).toContain('["isActive", "is_active"]');
    expect(helperSection![0]).toContain('["hourlyRate", "hourly_rate"]');
    expect(helperSection![0]).toContain('["pinHash", "pin_hash"]');
    expect(helperSection![0]).toContain('["pinUpdatedAt", "pin_updated_at"]');
    expect(helperSection![0]).toContain('["pinDisabled", "pin_disabled"]');
  });
});
