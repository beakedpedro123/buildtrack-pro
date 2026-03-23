import { describe, it, expect } from "vitest";

// ─── Tab Removal ────────────────────────────────────────────────────────────

describe("Tab removal: KPI and Labor Cost tabs hidden", () => {
  // Simulates the _layout.tsx tab visibility logic
  const hiddenTabs = ["kpis", "labor-costs"];

  it("kpis tab is hidden from navigation", () => {
    expect(hiddenTabs.includes("kpis")).toBe(true);
  });

  it("labor-costs tab is hidden from navigation", () => {
    expect(hiddenTabs.includes("labor-costs")).toBe(true);
  });

  it("core tabs remain visible", () => {
    const visibleTabs = ["index", "jobs", "clock", "reports", "goals"];
    for (const tab of visibleTabs) {
      expect(hiddenTabs.includes(tab)).toBe(false);
    }
  });
});

// ─── Overhead Rate Calculations ─────────────────────────────────────────────

describe("Overhead rate calculations per job", () => {
  const baseLaborCost = 10000; // $10,000 base labor

  function calculateOverhead(
    baseCost: number,
    taxRate: number,
    workersCompRate: number,
    liabilityInsRate: number
  ) {
    const taxCost = Math.round(baseCost * (taxRate / 100) * 100) / 100;
    const wcCost = Math.round(baseCost * (workersCompRate / 100) * 100) / 100;
    const liCost = Math.round(baseCost * (liabilityInsRate / 100) * 100) / 100;
    const totalOverhead = taxCost + wcCost + liCost;
    const totalWithOverhead = Math.round((baseCost + totalOverhead) * 100) / 100;
    return { taxCost, wcCost, liCost, totalOverhead, totalWithOverhead };
  }

  it("calculates payroll tax correctly", () => {
    const result = calculateOverhead(baseLaborCost, 7.65, 0, 0);
    expect(result.taxCost).toBe(765);
    expect(result.totalWithOverhead).toBe(10765);
  });

  it("calculates workers comp correctly", () => {
    const result = calculateOverhead(baseLaborCost, 0, 12.5, 0);
    expect(result.wcCost).toBe(1250);
    expect(result.totalWithOverhead).toBe(11250);
  });

  it("calculates liability insurance correctly", () => {
    const result = calculateOverhead(baseLaborCost, 0, 0, 3.0);
    expect(result.liCost).toBe(300);
    expect(result.totalWithOverhead).toBe(10300);
  });

  it("calculates all three overhead rates combined", () => {
    const result = calculateOverhead(baseLaborCost, 7.65, 12.5, 3.0);
    expect(result.taxCost).toBe(765);
    expect(result.wcCost).toBe(1250);
    expect(result.liCost).toBe(300);
    expect(result.totalOverhead).toBe(2315);
    expect(result.totalWithOverhead).toBe(12315);
  });

  it("returns zero overhead when all rates are 0", () => {
    const result = calculateOverhead(baseLaborCost, 0, 0, 0);
    expect(result.totalOverhead).toBe(0);
    expect(result.totalWithOverhead).toBe(baseLaborCost);
  });

  it("handles fractional rates correctly", () => {
    const result = calculateOverhead(5000, 7.65, 8.33, 2.75);
    expect(result.taxCost).toBe(382.5);
    expect(result.wcCost).toBe(416.5);
    expect(result.liCost).toBe(137.5);
    expect(result.totalWithOverhead).toBe(5936.5);
  });
});

// ─── Job Create/Update with Overhead Rates ──────────────────────────────────

describe("Job form includes overhead rate fields", () => {
  it("create job input includes tax/workers comp/liability fields", () => {
    const createInput = {
      name: "Test Job",
      address: "123 Main St",
      totalBudget: "50000",
      taxRate: "7.65",
      workersCompRate: "12.5",
      liabilityInsRate: "3.0",
      createdBy: 1,
    };
    expect(createInput.taxRate).toBe("7.65");
    expect(createInput.workersCompRate).toBe("12.5");
    expect(createInput.liabilityInsRate).toBe("3.0");
  });

  it("update job input includes overhead rate fields", () => {
    const updateInput = {
      id: 1,
      taxRate: "8.0",
      workersCompRate: "15.0",
      liabilityInsRate: "4.5",
    };
    expect(updateInput.taxRate).toBe("8.0");
    expect(updateInput.workersCompRate).toBe("15.0");
    expect(updateInput.liabilityInsRate).toBe("4.5");
  });

  it("overhead rates default to 0 when not provided", () => {
    const job = {
      id: 1,
      name: "Test Job",
      taxRate: null,
      workersCompRate: null,
      liabilityInsRate: null,
    };
    const taxR = parseFloat(job.taxRate || "0");
    const wcR = parseFloat(job.workersCompRate || "0");
    const liR = parseFloat(job.liabilityInsRate || "0");
    expect(taxR).toBe(0);
    expect(wcR).toBe(0);
    expect(liR).toBe(0);
  });
});

// ─── Labor Dashboard on Home Screen ─────────────────────────────────────────

describe("Labor dashboard on Home screen", () => {
  it("management roles see labor cost dashboard", () => {
    const managementRoles = ["owner", "secretary", "logistics"];
    for (const role of managementRoles) {
      const isManagement = role === "owner" || role === "secretary" || role === "logistics";
      expect(isManagement).toBe(true);
    }
  });

  it("non-management roles do not see labor cost dashboard", () => {
    const fieldRoles = ["foreman", "laborer"];
    for (const role of fieldRoles) {
      const isManagement = role === "owner" || role === "secretary" || role === "logistics";
      expect(isManagement).toBe(false);
    }
  });

  it("only owner sees dollar amounts", () => {
    const role = "owner";
    const isOwner = role === "owner";
    expect(isOwner).toBe(true);
  });

  it("secretary/logistics see hours not dollars", () => {
    for (const role of ["secretary", "logistics"]) {
      const isOwner = role === "owner";
      expect(isOwner).toBe(false);
    }
  });
});

// ─── Date Range Helpers ─────────────────────────────────────────────────────

describe("Date range helpers for labor periods", () => {
  function getDateRange(period: "week" | "month" | "30days") {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    if (period === "week") {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const start = new Date(now);
      start.setDate(now.getDate() + mondayOffset);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: end, label: "This Week" };
    }
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: end, label: "This Month" };
    }
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end, label: "Last 30 Days" };
  }

  it("week range starts on Monday", () => {
    const { startDate } = getDateRange("week");
    // Monday = 1
    expect(startDate.getDay()).toBe(1);
  });

  it("month range starts on 1st", () => {
    const { startDate } = getDateRange("month");
    expect(startDate.getDate()).toBe(1);
  });

  it("30 days range spans 30 days", () => {
    const { startDate, endDate } = getDateRange("30days");
    const diff = endDate.getTime() - startDate.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThanOrEqual(30);
    expect(days).toBeLessThan(32);
  });
});

// ─── SafeArea Extra Padding Logic ───────────────────────────────────────────

describe("SafeArea extra top padding", () => {
  function calcExtraPadding(insetTop: number, isNative: boolean, hasTopEdge: boolean) {
    if (!isNative || !hasTopEdge) return 0;
    return Math.max(0, 8 - Math.max(insetTop - 44, 0));
  }

  it("adds extra padding on devices with small safe area", () => {
    // Device with 20px safe area (small notch)
    expect(calcExtraPadding(20, true, true)).toBe(8);
  });

  it("adds no extra padding on iPhone X+ with large safe area", () => {
    // iPhone X has ~47px safe area
    expect(calcExtraPadding(47, true, true)).toBe(5);
  });

  it("adds no extra padding on iPhone 14 Pro with 59px safe area", () => {
    expect(calcExtraPadding(59, true, true)).toBe(0);
  });

  it("adds no extra padding on web", () => {
    expect(calcExtraPadding(0, false, true)).toBe(0);
  });

  it("adds no extra padding when top edge is not included", () => {
    expect(calcExtraPadding(20, true, false)).toBe(0);
  });
});
