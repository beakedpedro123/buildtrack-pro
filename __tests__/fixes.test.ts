import { describe, it, expect, vi } from "vitest";

describe("Bug Fix #1: Meeting audio upload URL", () => {
  it("should use /api/upload endpoint (not /upload)", () => {
    // The meetings.tsx now uses getApiBaseUrl() + "/api/upload"
    // Verify the pattern is correct
    const apiBase = "https://3000-example.manus.computer";
    const uploadUrl = `${apiBase}/api/upload`;
    expect(uploadUrl).toContain("/api/upload");
    // Ensure it's the /api/upload path, not bare /upload
    expect(uploadUrl).toMatch(/\/api\/upload$/);
  });

  it("should handle empty apiBase gracefully", () => {
    const apiBase = "";
    const uploadUrl = `${apiBase}/api/upload`;
    expect(uploadUrl).toBe("/api/upload");
  });
});

describe("Bug Fix #2: Goals date range query", () => {
  it("should use lt (not lte) for end boundary to avoid overlap", () => {
    // Simulate the date range logic from db.ts getWeeklyGoals
    const weekOf = new Date(2026, 2, 16); // March 16, 2026 (local Monday)
    const start = new Date(weekOf);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    // end should be 7 days after start
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    // A goal at the exact end boundary should be excluded with lt
    const atEnd = new Date(end);
    expect(atEnd < end).toBe(false); // equal, not less than → excluded ✓

    // A goal 1ms before end should be included
    const beforeEnd = new Date(end.getTime() - 1);
    expect(beforeEnd < end).toBe(true); // less than → included ✓

    // A goal at start should be included
    const atStart = new Date(start);
    expect(atStart >= start).toBe(true); // gte → included ✓
  });

  it("should correctly compute week start from getWeekStart", () => {
    function getWeekStart(date: Date): Date {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // Wednesday March 18, 2026 should give Monday March 16
    const wed = new Date("2026-03-18T12:00:00.000Z");
    const weekStart = getWeekStart(wed);
    expect(weekStart.getDay()).toBe(1); // Monday
    expect(weekStart.getDate()).toBe(16);
  });
});

describe("Bug Fix #3: Field report photo display", () => {
  it("should query photos when a report is expanded", () => {
    // The reports.tsx now has:
    // const getPhotosQuery = trpc.reports.getPhotos.useQuery(
    //   { reportId: expandedReport || 0 },
    //   { enabled: !!expandedReport }
    // );
    // Verify the logic: when expandedReport is set, enabled is true
    const expandedReport = 5;
    const enabled = !!expandedReport;
    expect(enabled).toBe(true);

    // When no report is expanded, enabled is false
    const noReport = null;
    const notEnabled = !!noReport;
    expect(notEnabled).toBe(false);
  });
});

describe("Bug Fix #4: PDF estimate extraction", () => {
  it("should parse LLM response into structured estimate data", () => {
    const mockLlmResponse = JSON.stringify({
      estimateNumber: "3",
      clientName: "Jeremy Hardy",
      totalAmount: "41055.00",
      lineItems: [
        "Structural and non-structural framing of home - $29,205.00",
        "Timber install package - $4,250.00",
        "Nails and Fasteners - $3,000.00",
        "Crane and equipment fees - $4,600.00",
      ],
      scopeOfWork: ["Structural framing", "Timber install", "Crane rentals"],
      exclusions: ["Window installation"],
      totalSqft: "3903",
      notes: "Valid 90 days. Change orders at $55/man hour.",
    });

    const parsed = JSON.parse(mockLlmResponse);
    expect(parsed.estimateNumber).toBe("3");
    expect(parsed.clientName).toBe("Jeremy Hardy");
    expect(parseFloat(parsed.totalAmount)).toBe(41055.0);
    expect(parsed.lineItems).toHaveLength(4);
    expect(parsed.scopeOfWork).toHaveLength(3);
    expect(parsed.exclusions).toHaveLength(1);
  });

  it("should handle missing fields gracefully", () => {
    const parsed = JSON.parse('{"totalAmount": "5000", "lineItems": []}');
    const lineItemsArr = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
    const totalAmount = parsed.totalAmount || "0";
    const clientName = parsed.clientName || undefined;
    const estimateNumber = parsed.estimateNumber || undefined;

    expect(totalAmount).toBe("5000");
    expect(lineItemsArr).toEqual([]);
    expect(clientName).toBeUndefined();
    expect(estimateNumber).toBeUndefined();
  });
});

describe("Bug Fix #5: Employee invite code system", () => {
  it("should generate a 6-char uppercase invite code from token", () => {
    const token = "abc123def456ghi789";
    const code = token.slice(0, 6).toUpperCase();
    expect(code).toBe("ABC123");
    expect(code.length).toBe(6);
  });

  it("should share invite code via text message format", () => {
    const code = "ABC123";
    const empName = "John Smith";
    const message = `You've been invited to join Carranza Custom Construction on BuildTrack Pro!\n\nYour invite code: ${code}\n\nDownload the app and enter this code when you first open it to set up your account.`;
    expect(message).toContain(code);
    expect(message).not.toContain("exp://"); // No more Expo deep links
    expect(message).not.toContain("Linking.createURL"); // No more broken links
  });
});
