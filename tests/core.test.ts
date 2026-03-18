import { describe, it, expect } from "vitest";

// ─── Utility helpers (pure functions, no DB required) ───────────────────────

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function calcBudgetPct(spent: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(spent / total, 1);
}

function getBudgetBarColor(pct: number): "success" | "warning" | "error" {
  if (pct < 0.6) return "success";
  if (pct < 0.85) return "warning";
  return "error";
}

function parseWorkItems(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  secretary: "Secretary",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats zero duration", () => {
    expect(formatDuration(0)).toBe("0h 0m");
  });
  it("formats 1 hour 30 minutes", () => {
    expect(formatDuration(5400000)).toBe("1h 30m");
  });
  it("formats 8 hours exactly", () => {
    expect(formatDuration(28800000)).toBe("8h 0m");
  });
  it("formats partial minutes", () => {
    expect(formatDuration(3660000)).toBe("1h 1m");
  });
});

describe("getInitials", () => {
  it("returns two initials for full name", () => {
    expect(getInitials("John Smith")).toBe("JS");
  });
  it("returns single initial for single name", () => {
    expect(getInitials("Owner")).toBe("O");
  });
  it("returns first two initials for three-part name", () => {
    expect(getInitials("Mary Jane Watson")).toBe("MJ");
  });
  it("uppercases initials", () => {
    expect(getInitials("carlos mendez")).toBe("CM");
  });
});

describe("calcBudgetPct", () => {
  it("returns 0 for zero total budget", () => {
    expect(calcBudgetPct(1000, 0)).toBe(0);
  });
  it("returns 0.5 for half spent", () => {
    expect(calcBudgetPct(5000, 10000)).toBe(0.5);
  });
  it("caps at 1.0 when over budget", () => {
    expect(calcBudgetPct(12000, 10000)).toBe(1);
  });
  it("returns exact ratio", () => {
    expect(calcBudgetPct(8500, 10000)).toBeCloseTo(0.85);
  });
});

describe("getBudgetBarColor", () => {
  it("returns success for under 60%", () => {
    expect(getBudgetBarColor(0.5)).toBe("success");
  });
  it("returns warning for 60-84%", () => {
    expect(getBudgetBarColor(0.75)).toBe("warning");
  });
  it("returns error for 85% and above", () => {
    expect(getBudgetBarColor(0.85)).toBe("error");
    expect(getBudgetBarColor(1.0)).toBe("error");
  });
  it("returns success at exactly 0%", () => {
    expect(getBudgetBarColor(0)).toBe("success");
  });
});

describe("parseWorkItems", () => {
  it("parses valid JSON array", () => {
    const items = parseWorkItems('["Framing", "Drywall", "Electrical rough-in"]');
    expect(items).toEqual(["Framing", "Drywall", "Electrical rough-in"]);
  });
  it("returns empty array for invalid JSON", () => {
    expect(parseWorkItems("not json")).toEqual([]);
  });
  it("returns empty array for non-array JSON", () => {
    expect(parseWorkItems('{"key": "value"}')).toEqual([]);
  });
  it("returns empty array for empty string", () => {
    expect(parseWorkItems("")).toEqual([]);
  });
});

describe("isValidPin", () => {
  it("accepts 4-digit PIN", () => {
    expect(isValidPin("1234")).toBe(true);
  });
  it("accepts 6-digit PIN", () => {
    expect(isValidPin("123456")).toBe(true);
  });
  it("rejects 3-digit PIN", () => {
    expect(isValidPin("123")).toBe(false);
  });
  it("rejects 7-digit PIN", () => {
    expect(isValidPin("1234567")).toBe(false);
  });
  it("rejects non-numeric PIN", () => {
    expect(isValidPin("abcd")).toBe(false);
  });
  it("rejects PIN with spaces", () => {
    expect(isValidPin("12 34")).toBe(false);
  });
});

describe("ROLE_LABELS", () => {
  it("has all five roles", () => {
    const roles = ["owner", "secretary", "logistics", "foreman", "laborer"];
    for (const role of roles) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
  it("owner label is Owner", () => {
    expect(ROLE_LABELS["owner"]).toBe("Owner");
  });
  it("laborer label is Laborer", () => {
    expect(ROLE_LABELS["laborer"]).toBe("Laborer");
  });
});
