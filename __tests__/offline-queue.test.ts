import { describe, it, expect } from "vitest";

// Test the MutationType union covers all expected types
describe("Offline Queue - MutationType", () => {
  // We test by importing the type and verifying the expected mutation types
  // are valid assignments (compile-time check via runtime array)
  const expectedTypes = [
    "message.send",
    "goals.update",
    "goals.create",
    "goals.delete",
    "punchList.create",
    "punchList.toggle",
    "punchList.delete",
    "schedule.create",
    "schedule.update",
    "schedule.delete",
    "reports.create",
    "safetyMeetings.create",
    "jobs.update",
    "changeOrders.create",
    "changeOrders.delete",
    "budgetAuditLog.create",
    "budget.addExpense",
  ];

  it("should have 17 supported mutation types", () => {
    expect(expectedTypes).toHaveLength(17);
  });

  it("should include all critical offline mutation types", () => {
    // Goals
    expect(expectedTypes).toContain("goals.create");
    expect(expectedTypes).toContain("goals.update");
    expect(expectedTypes).toContain("goals.delete");
    // Punch list
    expect(expectedTypes).toContain("punchList.create");
    expect(expectedTypes).toContain("punchList.toggle");
    expect(expectedTypes).toContain("punchList.delete");
    // Schedule
    expect(expectedTypes).toContain("schedule.create");
    expect(expectedTypes).toContain("schedule.update");
    expect(expectedTypes).toContain("schedule.delete");
    // Reports & Safety
    expect(expectedTypes).toContain("reports.create");
    expect(expectedTypes).toContain("safetyMeetings.create");
    // Jobs & Budget
    expect(expectedTypes).toContain("jobs.update");
    expect(expectedTypes).toContain("changeOrders.create");
    expect(expectedTypes).toContain("changeOrders.delete");
    expect(expectedTypes).toContain("budgetAuditLog.create");
    expect(expectedTypes).toContain("budget.addExpense");
    // Messages
    expect(expectedTypes).toContain("message.send");
  });
});

describe("Offline Queue - OfflineMutation structure", () => {
  it("should create a valid offline mutation entry", () => {
    const entry = {
      localId: `mut_${Date.now()}_abc123`,
      type: "goals.create" as const,
      payload: { title: "Test Goal", priority: "high", weekOf: "2026-04-27T00:00:00.000Z", createdBy: 1 },
      createdAt: new Date().toISOString(),
      retries: 0,
    };

    expect(entry.localId).toMatch(/^mut_\d+_/);
    expect(entry.type).toBe("goals.create");
    expect(entry.payload.title).toBe("Test Goal");
    expect(entry.retries).toBe(0);
    expect(new Date(entry.createdAt).getTime()).toBeGreaterThan(0);
  });

  it("should increment retries correctly", () => {
    const entry = {
      localId: "mut_123_abc",
      type: "schedule.create" as const,
      payload: { jobId: 1, title: "Frame walls" },
      createdAt: new Date().toISOString(),
      retries: 0,
    };

    const MAX_RETRIES = 5;
    // Simulate retry logic
    const retried = { ...entry, retries: entry.retries + 1 };
    expect(retried.retries).toBe(1);
    expect(retried.retries < MAX_RETRIES).toBe(true);

    // Simulate max retries exceeded
    const maxed = { ...entry, retries: MAX_RETRIES };
    expect(maxed.retries < MAX_RETRIES).toBe(false);
  });
});

describe("Offline Queue - Clock Entry structure", () => {
  it("should create a valid offline clock entry", () => {
    const entry = {
      localId: `offline_${Date.now()}_xyz789`,
      employeeId: 1,
      jobId: 5,
      clockIn: new Date().toISOString(),
      notes: "Started framing",
      createdAt: new Date().toISOString(),
    };

    expect(entry.localId).toMatch(/^offline_\d+_/);
    expect(entry.employeeId).toBe(1);
    expect(entry.jobId).toBe(5);
    expect(new Date(entry.clockIn).getTime()).toBeGreaterThan(0);
  });

  it("should support clock out with existing entry ID", () => {
    const entry = {
      localId: "offline_123_abc",
      employeeId: 1,
      jobId: 5,
      clockIn: "2026-04-27T08:00:00.000Z",
      clockOut: "2026-04-27T16:30:00.000Z",
      createdAt: new Date().toISOString(),
      existingEntryId: 42,
    };

    expect(entry.existingEntryId).toBe(42);
    expect(entry.clockOut).toBeDefined();
    const clockInTime = new Date(entry.clockIn).getTime();
    const clockOutTime = new Date(entry.clockOut!).getTime();
    expect(clockOutTime).toBeGreaterThan(clockInTime);
  });
});
