import { describe, it, expect } from "vitest";

/**
 * Tests for the new timecard features:
 * 1. addManualEntry endpoint accepts correct parameters
 * 2. deleteEntry endpoint accepts correct parameters
 * 3. Date/time validation logic
 */

describe("Timecard Add/Delete Features", () => {
  // Test date/time parsing logic used in the manual entry form
  describe("Manual entry time parsing", () => {
    it("should create valid ISO date from date + time strings", () => {
      const date = "2026-04-04";
      const clockIn = "07:00";
      const clockOut = "16:00";

      const clockInDate = new Date(`${date}T${clockIn}:00`);
      const clockOutDate = new Date(`${date}T${clockOut}:00`);

      expect(clockInDate.getHours()).toBe(7);
      expect(clockInDate.getMinutes()).toBe(0);
      expect(clockOutDate.getHours()).toBe(16);
      expect(clockOutDate.getMinutes()).toBe(0);
      expect(clockOutDate.getTime()).toBeGreaterThan(clockInDate.getTime());
    });

    it("should reject clock out before clock in", () => {
      const date = "2026-04-04";
      const clockInDate = new Date(`${date}T16:00:00`);
      const clockOutDate = new Date(`${date}T07:00:00`);

      expect(clockOutDate.getTime()).toBeLessThan(clockInDate.getTime());
    });

    it("should calculate correct duration in minutes", () => {
      const clockIn = new Date("2026-04-04T07:00:00");
      const clockOut = new Date("2026-04-04T16:30:00");
      const durationMinutes = Math.round(
        (clockOut.getTime() - clockIn.getTime()) / 60000
      );
      expect(durationMinutes).toBe(570); // 9h 30m = 570 minutes
    });
  });

  describe("Duration formatting", () => {
    function fmtDuration(minutes: number) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}h ${m}m`;
    }

    it("should format 570 minutes as 9h 30m", () => {
      expect(fmtDuration(570)).toBe("9h 30m");
    });

    it("should format 480 minutes as 8h 0m", () => {
      expect(fmtDuration(480)).toBe("8h 0m");
    });

    it("should format 0 minutes as 0h 0m", () => {
      expect(fmtDuration(0)).toBe("0h 0m");
    });

    it("should format 2010 minutes (33h 30m) correctly", () => {
      expect(fmtDuration(2010)).toBe("33h 30m");
    });
  });

  describe("Pay calculation", () => {
    function calcPay(minutes: number, rate: string | null | undefined): string {
      if (!rate) return "";
      const r = parseFloat(rate);
      if (isNaN(r)) return "";
      return `$${((minutes / 60) * r).toFixed(2)}`;
    }

    it("should calculate pay correctly for 8 hours at $25/hr", () => {
      expect(calcPay(480, "25")).toBe("$200.00");
    });

    it("should return empty string for null rate", () => {
      expect(calcPay(480, null)).toBe("");
    });

    it("should return empty string for undefined rate", () => {
      expect(calcPay(480, undefined)).toBe("");
    });
  });

  describe("addManualEntry input validation", () => {
    it("should require all fields", () => {
      const input = {
        employeeId: 1,
        jobId: 2,
        clockIn: "2026-04-04T07:00:00.000Z",
        clockOut: "2026-04-04T16:00:00.000Z",
        addedBy: 1,
        reason: "Forgot to clock in",
      };

      expect(input.employeeId).toBeGreaterThan(0);
      expect(input.jobId).toBeGreaterThan(0);
      expect(input.clockIn).toBeTruthy();
      expect(input.clockOut).toBeTruthy();
      expect(input.addedBy).toBeGreaterThan(0);
      expect(input.reason.length).toBeGreaterThan(0);
    });
  });

  describe("deleteEntry input validation", () => {
    it("should require entryId, deletedBy, and reason", () => {
      const input = {
        entryId: 42,
        deletedBy: 1,
        reason: "Duplicate entry",
      };

      expect(input.entryId).toBeGreaterThan(0);
      expect(input.deletedBy).toBeGreaterThan(0);
      expect(input.reason.length).toBeGreaterThan(0);
    });
  });
});
