import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

describe("Phase 16 — Budget Alerts", () => {
  const dbTs = readFile("server/db.ts");
  const routersTs = readFile("server/routers.ts");
  const indexTsx = readFile("app/(tabs)/index.tsx");
  const jobsTsx = readFile("app/(tabs)/jobs.tsx");

  it("should have getBudgetAlerts function in db.ts", () => {
    expect(dbTs).toContain("export async function getBudgetAlerts()");
  });

  it("should calculate labor cost, overhead, and expenses in getBudgetAlerts", () => {
    expect(dbTs).toContain("laborCost");
    expect(dbTs).toContain("overheadCost");
    expect(dbTs).toContain("expensesCost");
    expect(dbTs).toContain("totalSpend");
    expect(dbTs).toContain("percentUsed");
    expect(dbTs).toContain("alertLevel");
  });

  it("should define alert thresholds: 80% warning, 90% danger, 100% critical", () => {
    expect(dbTs).toContain("percentUsed >= 100");
    expect(dbTs).toContain("percentUsed >= 90");
    expect(dbTs).toContain("percentUsed >= 80");
    expect(dbTs).toContain('"critical"');
    expect(dbTs).toContain('"danger"');
    expect(dbTs).toContain('"warning"');
  });

  it("should have budgetAlerts router in routers.ts", () => {
    expect(routersTs).toContain("budgetAlertsRouter");
    expect(routersTs).toContain("getAlerts");
    expect(routersTs).toContain("budgetAlerts: budgetAlertsRouter");
  });

  it("should show budget alerts section on Home screen for owner", () => {
    expect(indexTsx).toContain("budgetAlerts.getAlerts.useQuery");
    expect(indexTsx).toContain("Budget Alerts");
    expect(indexTsx).toContain("activeAlerts");
    expect(indexTsx).toContain("isOwner && activeAlerts.length > 0");
  });

  it("should display color-coded alert banners on Home screen", () => {
    expect(indexTsx).toContain("alertLevel");
    expect(indexTsx).toContain("#FEF3C7"); // warning bg
    expect(indexTsx).toContain("#FEE2E2"); // critical bg
    expect(indexTsx).toContain("#F59E0B"); // warning border
    expect(indexTsx).toContain("#EF4444"); // critical border
  });

  it("should show alert progress bar on Home screen", () => {
    expect(indexTsx).toContain("Math.min(alert.percentUsed, 100)");
  });

  it("should show spend breakdown (labor, overhead, expenses) in alert banner", () => {
    expect(indexTsx).toContain("Labor:");
    expect(indexTsx).toContain("Overhead:");
    expect(indexTsx).toContain("Expenses:");
  });

  it("should show budget alert banner in Jobs Budget tab", () => {
    expect(jobsTsx).toContain("budgetAlertLevel");
    expect(jobsTsx).toContain("OVER BUDGET");
    expect(jobsTsx).toContain("BUDGET DANGER");
    expect(jobsTsx).toContain("BUDGET WARNING");
  });

  it("should calculate budgetPctRaw for alert thresholds in Jobs screen", () => {
    expect(jobsTsx).toContain("budgetPctRaw");
    expect(jobsTsx).toContain('budgetPctRaw >= 100 ? "critical"');
    expect(jobsTsx).toContain('budgetPctRaw >= 90 ? "danger"');
    expect(jobsTsx).toContain('budgetPctRaw >= 80 ? "warning"');
  });
});

describe("Phase 16 — Goal Deadlines", () => {
  const schemaTs = readFile("drizzle/schema.ts");
  const routersTs = readFile("server/routers.ts");
  const goalsTsx = readFile("app/(tabs)/goals.tsx");

  it("should have deadline column in weeklyGoals schema", () => {
    expect(schemaTs).toContain('deadline: timestamp("deadline")');
  });

  it("should accept deadline in goals create mutation", () => {
    expect(routersTs).toContain("deadline: z.string().optional()");
  });

  it("should accept deadline in goals update mutation", () => {
    expect(routersTs).toContain("deadline: z.string().nullable().optional()");
  });

  it("should have deadline state in goals screen", () => {
    expect(goalsTsx).toContain("newGoalDeadline");
    expect(goalsTsx).toContain("setNewGoalDeadline");
  });

  it("should provide quick deadline picker buttons", () => {
    expect(goalsTsx).toContain("No Deadline");
    expect(goalsTsx).toContain("End of Week");
    expect(goalsTsx).toContain("Tomorrow");
    expect(goalsTsx).toContain("+3 Days");
    expect(goalsTsx).toContain("+1 Week");
  });

  it("should send deadline when creating a goal", () => {
    expect(goalsTsx).toContain("deadline: newGoalDeadline || undefined");
  });

  it("should show overdue indicator on goal cards", () => {
    expect(goalsTsx).toContain("OVERDUE");
    expect(goalsTsx).toContain("Due Soon");
    expect(goalsTsx).toContain("isOverdue");
    expect(goalsTsx).toContain("isDueSoon");
  });

  it("should color-code deadline badge: red for overdue, yellow for due soon", () => {
    expect(goalsTsx).toContain("colors.error");
    expect(goalsTsx).toContain("colors.warning");
    expect(goalsTsx).toContain("deadlineColor");
  });

  it("should reset deadline when cancelling goal creation", () => {
    expect(goalsTsx).toContain('setNewGoalDeadline("")');
  });
});
