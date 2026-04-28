import { describe, it, expect } from "vitest";

describe("Phase 132: Budget Report Date Range + Lunch", () => {
  describe("getBudgetDateParams logic", () => {
    function getBudgetDateParams(
      budgetDateRange: "1pay" | "2pay" | "month" | "custom",
      budgetCustomStart = "",
      budgetCustomEnd = ""
    ) {
      const now = new Date();
      let startDate = "";
      let endDate = "";
      if (budgetDateRange === "1pay") {
        const end = new Date(now);
        const start = new Date(now);
        start.setDate(start.getDate() - 14);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      } else if (budgetDateRange === "2pay") {
        const end = new Date(now);
        const start = new Date(now);
        start.setDate(start.getDate() - 28);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      } else if (budgetDateRange === "month") {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        endDate = now.toISOString().slice(0, 10);
      } else if (budgetDateRange === "custom") {
        startDate = budgetCustomStart;
        endDate = budgetCustomEnd;
      }
      return { startDate, endDate };
    }

    it("1pay returns 14-day range", () => {
      const { startDate, endDate } = getBudgetDateParams("1pay");
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diff).toBe(14);
    });

    it("2pay returns 28-day range", () => {
      const { startDate, endDate } = getBudgetDateParams("2pay");
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diff).toBe(28);
    });

    it("month starts on the 1st", () => {
      const { startDate } = getBudgetDateParams("month");
      expect(startDate).toMatch(/-01$/);
    });

    it("custom returns user-provided dates", () => {
      const { startDate, endDate } = getBudgetDateParams("custom", "2026-01-01", "2026-01-31");
      expect(startDate).toBe("2026-01-01");
      expect(endDate).toBe("2026-01-31");
    });
  });

  describe("Billing rate selection", () => {
    function getEffectiveRate(budgetBillingRate: number | null, budgetCustomRate: string) {
      return budgetBillingRate === -1 ? (parseInt(budgetCustomRate) || 0) : budgetBillingRate;
    }

    it("null returns null (job default)", () => {
      expect(getEffectiveRate(null, "")).toBe(null);
    });

    it("preset rate returns the rate", () => {
      expect(getEffectiveRate(45, "")).toBe(45);
      expect(getEffectiveRate(50, "")).toBe(50);
      expect(getEffectiveRate(55, "")).toBe(55);
      expect(getEffectiveRate(60, "")).toBe(60);
    });

    it("custom rate (-1) uses custom input", () => {
      expect(getEffectiveRate(-1, "75")).toBe(75);
      expect(getEffectiveRate(-1, "")).toBe(0);
    });
  });

  describe("Clock entry date filtering", () => {
    const entries = [
      { clockIn: "2026-04-01T08:00:00Z", clockOut: "2026-04-01T16:00:00Z" },
      { clockIn: "2026-04-10T08:00:00Z", clockOut: "2026-04-10T16:00:00Z" },
      { clockIn: "2026-04-20T08:00:00Z", clockOut: "2026-04-20T16:00:00Z" },
      { clockIn: "2026-04-27T08:00:00Z", clockOut: "2026-04-27T16:00:00Z" },
    ];

    function filterByRange(entries: any[], startDate?: string, endDate?: string) {
      if (!startDate && !endDate) return entries;
      const rangeStart = startDate ? new Date(startDate + "T00:00:00") : new Date(0);
      const rangeEnd = endDate ? new Date(endDate + "T23:59:59") : new Date();
      return entries.filter(e => {
        const d = new Date(e.clockIn);
        return d >= rangeStart && d <= rangeEnd;
      });
    }

    it("filters to 2-week range", () => {
      const filtered = filterByRange(entries, "2026-04-14", "2026-04-27");
      expect(filtered.length).toBe(2);
    });

    it("returns all when no range", () => {
      const filtered = filterByRange(entries);
      expect(filtered.length).toBe(4);
    });

    it("filters to single day", () => {
      const filtered = filterByRange(entries, "2026-04-10", "2026-04-10");
      expect(filtered.length).toBe(1);
    });
  });

  describe("Lunch minutes calculation", () => {
    it("deducts lunch from total minutes", () => {
      const clockIn = new Date("2026-04-27T08:00:00Z");
      const clockOut = new Date("2026-04-27T16:00:00Z");
      const totalMins = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
      const lunchMins = 30;
      const netMins = Math.max(0, totalMins - lunchMins);
      expect(totalMins).toBe(480);
      expect(netMins).toBe(450);
    });

    it("handles zero lunch", () => {
      const totalMins = 480;
      const lunchMins = 0;
      const netMins = Math.max(0, totalMins - lunchMins);
      expect(netMins).toBe(480);
    });
  });
});
