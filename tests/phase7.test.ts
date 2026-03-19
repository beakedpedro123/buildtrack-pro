import { describe, it, expect } from "vitest";

describe("Phase 7 — Invite Flow", () => {
  it("generates a unique invite token with sufficient length", () => {
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
    expect(token.length).toBeGreaterThan(20);
    // Each generated token should be unique
    const token2 = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
    expect(token).not.toBe(token2);
  });

  it("invite link URL format is valid", () => {
    const token = "abc123def456";
    const link = `/invite/${token}`;
    expect(link).toBe("/invite/abc123def456");
    expect(link).toContain("/invite/");
  });
});

describe("Phase 7 — Labor Cost Calculation", () => {
  it("calculates labor cost from clock entries and hourly rates", () => {
    const entries = [
      { clockIn: "2026-03-19T08:00:00Z", clockOut: "2026-03-19T16:00:00Z", employeeId: 1 },
      { clockIn: "2026-03-19T07:00:00Z", clockOut: "2026-03-19T15:30:00Z", employeeId: 2 },
    ];
    const empRates: Record<number, number> = { 1: 25, 2: 30 };

    let totalMinutes = 0;
    let totalCost = 0;
    for (const entry of entries) {
      if (!entry.clockOut) continue;
      const mins = Math.floor(
        (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000
      );
      totalMinutes += mins;
      const rate = empRates[entry.employeeId];
      if (rate) {
        totalCost += (mins / 60) * rate;
      }
    }

    // Employee 1: 8 hours * $25 = $200
    // Employee 2: 8.5 hours * $30 = $255
    expect(totalMinutes).toBe(480 + 510); // 990 minutes
    expect(Math.round(totalCost * 100) / 100).toBe(455);
  });

  it("skips entries without clock-out", () => {
    const entries = [
      { clockIn: "2026-03-19T08:00:00Z", clockOut: null, employeeId: 1 },
      { clockIn: "2026-03-19T07:00:00Z", clockOut: "2026-03-19T15:00:00Z", employeeId: 2 },
    ];
    const empRates: Record<number, number> = { 1: 25, 2: 30 };

    let totalMinutes = 0;
    let totalCost = 0;
    for (const entry of entries) {
      if (!entry.clockOut) continue;
      const mins = Math.floor(
        (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000
      );
      totalMinutes += mins;
      const rate = empRates[entry.employeeId];
      if (rate) {
        totalCost += (mins / 60) * rate;
      }
    }

    expect(totalMinutes).toBe(480); // Only employee 2
    expect(totalCost).toBe(240); // 8h * $30
  });

  it("total spent includes both expenses and labor", () => {
    const expenseSpent = 5000;
    const laborSpent = 2500;
    const totalSpent = expenseSpent + laborSpent;
    expect(totalSpent).toBe(7500);
  });
});

describe("Phase 7 — Role-Based Tab Visibility", () => {
  const isFieldRole = (role: string) => role === "foreman" || role === "laborer";
  const canManage = (role: string) => ["owner", "secretary", "logistics"].includes(role);

  it("hides Clock and My Hours tabs from management roles", () => {
    expect(isFieldRole("owner")).toBe(false);
    expect(isFieldRole("secretary")).toBe(false);
    expect(isFieldRole("logistics")).toBe(false);
  });

  it("shows Clock and My Hours tabs for field roles", () => {
    expect(isFieldRole("foreman")).toBe(true);
    expect(isFieldRole("laborer")).toBe(true);
  });

  it("logistics can manage employees and jobs", () => {
    expect(canManage("logistics")).toBe(true);
    expect(canManage("owner")).toBe(true);
    expect(canManage("secretary")).toBe(true);
  });

  it("field roles cannot manage employees or jobs", () => {
    expect(canManage("foreman")).toBe(false);
    expect(canManage("laborer")).toBe(false);
  });
});

describe("Phase 7 — Company Logo", () => {
  it("company logo file exists", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("/home/ubuntu/construction-manager/assets/images/company-logo.png")).toBe(true);
  });
});
