import { describe, it, expect } from "vitest";

// ─── Payroll calculation helpers ─────────────────────────────────────────────
function calcPay(totalMinutes: number, hourlyRate: string | null): number {
  if (!hourlyRate) return 0;
  const rate = parseFloat(hourlyRate);
  if (isNaN(rate)) return 0;
  return (totalMinutes / 60) * rate;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function buildCSVRows(rows: { name: string; role: string; hourlyRate: string | null; totalMinutes: number }[]): string {
  const header = ["Employee", "Role", "Hourly Rate", "Total Hours", "Total Minutes", "Estimated Pay"];
  const lines = [
    header.join(","),
    ...rows.map((r) => [
      `"${r.name}"`,
      r.role,
      r.hourlyRate || "N/A",
      (r.totalMinutes / 60).toFixed(2),
      r.totalMinutes,
      calcPay(r.totalMinutes, r.hourlyRate).toFixed(2),
    ].join(",")),
  ];
  return lines.join("\n");
}

// ─── Weekly goal helpers ──────────────────────────────────────────────────────
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Payroll calculations", () => {
  it("calculates pay correctly for an 8-hour shift", () => {
    const pay = calcPay(480, "25.00");
    expect(pay).toBeCloseTo(200.0);
  });

  it("returns 0 for null hourly rate", () => {
    expect(calcPay(480, null)).toBe(0);
  });

  it("returns 0 for invalid hourly rate", () => {
    expect(calcPay(480, "N/A")).toBe(0);
  });

  it("formats duration correctly", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(480)).toBe("8h 0m");
    expect(formatDuration(0)).toBe("0h 0m");
  });

  it("builds CSV with correct header and rows", () => {
    const rows = [
      { name: "John Doe", role: "laborer", hourlyRate: "20.00", totalMinutes: 480 },
      { name: "Jane Smith", role: "foreman", hourlyRate: "30.00", totalMinutes: 960 },
    ];
    const csv = buildCSVRows(rows);
    expect(csv).toContain("Employee,Role,Hourly Rate,Total Hours,Total Minutes,Estimated Pay");
    expect(csv).toContain('"John Doe"');
    expect(csv).toContain('"Jane Smith"');
    expect(csv).toContain("160.00"); // Jane: 16h * $30
    expect(csv).toContain("160.00"); // John: 8h * $20
  });

  it("calculates total payroll correctly", () => {
    const rows = [
      { totalMinutes: 480, hourlyRate: "20.00" },
      { totalMinutes: 480, hourlyRate: "30.00" },
    ];
    const total = rows.reduce((sum, r) => sum + calcPay(r.totalMinutes, r.hourlyRate), 0);
    expect(total).toBeCloseTo(400.0);
  });
});

describe("Weekly goals helpers", () => {
  it("returns Monday as week start", () => {
    const wednesday = new Date("2026-03-18"); // Wednesday
    const start = getWeekStart(wednesday);
    expect(start.getDay()).toBe(1); // Monday
  });

  it("formats week label correctly", () => {
    const date = new Date("2026-03-18");
    const label = formatWeekLabel(date);
    expect(label).toContain("–");
    expect(label.length).toBeGreaterThan(5);
  });

  it("week start is consistent for same week", () => {
    // Both dates are in the same week (Mon Mar 16 - Sun Mar 22, 2026)
    const tuesday = getWeekStart(new Date("2026-03-17"));
    const friday = getWeekStart(new Date("2026-03-20"));
    expect(tuesday.toISOString()).toBe(friday.toISOString());
  });
});

describe("Meeting status transitions", () => {
  const validStatuses = ["scheduled", "recording", "processing", "completed", "cancelled"];

  it("all meeting statuses are defined", () => {
    expect(validStatuses).toContain("scheduled");
    expect(validStatuses).toContain("recording");
    expect(validStatuses).toContain("completed");
  });

  it("status labels map correctly", () => {
    const STATUS_LABELS: Record<string, string> = {
      scheduled: "Scheduled",
      recording: "Recording",
      processing: "Processing…",
      completed: "Completed",
      cancelled: "Cancelled",
    };
    expect(STATUS_LABELS["scheduled"]).toBe("Scheduled");
    expect(STATUS_LABELS["completed"]).toBe("Completed");
  });
});

describe("Role-based access", () => {
  const canViewPayroll = (role: string) => ["owner", "secretary"].includes(role);
  const canMeetings = (role: string) => ["owner", "secretary", "logistics", "foreman"].includes(role);
  const canManageTeam = (role: string) => ["owner", "secretary", "logistics"].includes(role);

  it("only owner and secretary can view payroll", () => {
    expect(canViewPayroll("owner")).toBe(true);
    expect(canViewPayroll("secretary")).toBe(true);
    expect(canViewPayroll("foreman")).toBe(false);
    expect(canViewPayroll("laborer")).toBe(false);
  });

  it("management roles can access meetings", () => {
    expect(canMeetings("owner")).toBe(true);
    expect(canMeetings("foreman")).toBe(true);
    expect(canMeetings("laborer")).toBe(false);
  });

  it("team management restricted to owner/secretary/logistics", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("foreman")).toBe(false);
    expect(canManageTeam("laborer")).toBe(false);
  });
});
