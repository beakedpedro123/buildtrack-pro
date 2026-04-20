import { describe, it, expect } from "vitest";

/**
 * Tests for the timecard system:
 * - Server endpoints exist (adjustEntry, getDetailedTimecard, getAdjustments)
 * - Schema has timeAdjustments table
 * - Native timecard screen exists
 * - PWA timecard page exists
 * - Employee names are clickable in dashboard, payroll, and team screens
 */

describe("Timecard System - Schema", () => {
  it("should have timeAdjustments table in drizzle schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.timeAdjustments).toBeDefined();
    // Verify the table has the expected columns
    const columns = Object.keys(schema.timeAdjustments);
    expect(columns.length).toBeGreaterThan(0);
  });
});

describe("Timecard System - DB Functions", () => {
  it("should export updateClockEntryWithAdjustment function", async () => {
    const db = await import("../server/db");
    expect(typeof db.updateClockEntryWithAdjustment).toBe("function");
  });

  it("should export getDetailedTimecard function", async () => {
    const db = await import("../server/db");
    expect(typeof db.getDetailedTimecard).toBe("function");
  });

  it("should export getAdjustmentsForEntry function", async () => {
    const db = await import("../server/db");
    expect(typeof db.getAdjustmentsForEntry).toBe("function");
  });
});

describe("Timecard System - Router Endpoints", () => {
  it("should have adjustEntry, getDetailedTimecard, getAdjustments in clock router", async () => {
    // Read the routers file to verify endpoints exist
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("adjustEntry:");
    expect(routersContent).toContain("getDetailedTimecard:");
    expect(routersContent).toContain("getAdjustments:");
    
    // Verify adjustEntry requires a reason
    expect(routersContent).toContain("reason: z.string()");
    expect(routersContent).toContain("adjustedBy: z.number()");
  });
});

describe("Timecard System - Native App Screens", () => {
  it("should have timecard detail screen at app/timecard/[id].tsx", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync("app/timecard/[id].tsx");
    expect(exists).toBe(true);
    
    const content = fs.readFileSync("app/timecard/[id].tsx", "utf-8");
    // Should have adjustment modal with reason field
    expect(content).toContain("adjustEntry");
    expect(content).toContain("reason");
    // Should show daily breakdown
    expect(content).toContain("getDetailedTimecard");
  });

  it("should have timecard route in _layout.tsx", async () => {
    const fs = await import("fs");
    const layout = fs.readFileSync("app/_layout.tsx", "utf-8");
    expect(layout).toContain("timecard/[id]");
  });
});

describe("Timecard System - Clickable Employee Names", () => {
  it("should have clickable employee names in dashboard index.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");
    // Should navigate to timecard when employee name is tapped
    expect(content).toContain("timecard");
    expect(content).toContain("router.push");
  });

  it("should have clickable employee names in payroll.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/payroll.tsx", "utf-8");
    expect(content).toContain("timecard");
    expect(content).toContain("router.push");
  });

  it("should have clickable employee names in hours.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/hours.tsx", "utf-8");
    expect(content).toContain("timecard");
  });
});

describe.skip("Timecard System - PWA (legacy, skipped)", () => {
  it("should have TimecardPage in PWA source", async () => {
    const fs = await import("fs");
    const pwaPath = "/home/ubuntu/buildtrack-pwa/src/pages/TimecardPage.tsx";
    const exists = fs.existsSync(pwaPath);
    expect(exists).toBe(true);
    
    const content = fs.readFileSync(pwaPath, "utf-8");
    expect(content).toContain("adjustEntry");
    expect(content).toContain("getDetailedTimecard");
    expect(content).toContain("reason");
  });

  it("should have timecard route in PWA App.tsx", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync("/home/ubuntu/buildtrack-pwa/src/App.tsx", "utf-8");
    expect(appContent).toContain("TimecardPage");
    expect(appContent).toContain("/more/timecard/:id");
  });

  it("should have optimistic clock-out in PWA ClockPage", async () => {
    const fs = await import("fs");
    const clockContent = fs.readFileSync("/home/ubuntu/buildtrack-pwa/src/pages/ClockPage.tsx", "utf-8");
    // Should have optimistic update
    expect(clockContent).toContain("Optimistic");
    expect(clockContent).toContain("setData");
  });

  it("should have clickable employee names in PWA DashboardPage", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/buildtrack-pwa/src/pages/DashboardPage.tsx", "utf-8");
    expect(content).toContain("/more/timecard/");
  });

  it("should have clickable employee names in PWA PayrollPage", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/buildtrack-pwa/src/pages/PayrollPage.tsx", "utf-8");
    expect(content).toContain("/more/timecard/");
  });
});
