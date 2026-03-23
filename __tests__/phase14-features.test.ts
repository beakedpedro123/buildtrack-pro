import { describe, it, expect } from "vitest";

// ─── Goals Visibility Logic ──────────────────────────────────────────────────

describe("Goals visibility rules", () => {
  const makeGoals = () => [
    { id: 1, title: "Frame walls", assignedTo: 10, status: "pending" },
    { id: 2, title: "Order lumber", assignedTo: 20, status: "in_progress" },
    { id: 3, title: "Review budget", assignedTo: 30, status: "completed" },
    { id: 4, title: "Unassigned task", assignedTo: null, status: "pending" },
  ];

  it("owner sees all goals when filter is 'all'", () => {
    const goals = makeGoals();
    const isOwner = true;
    const filterAssignee: number | "all" = "all";
    const employeeId = 1;

    let filtered = [...goals];
    if (isOwner) {
      if (filterAssignee !== "all") {
        filtered = filtered.filter((g) => g.assignedTo === filterAssignee);
      }
    } else {
      filtered = filtered.filter((g) => g.assignedTo === employeeId);
    }

    expect(filtered).toHaveLength(4);
  });

  it("owner can filter by specific assignee", () => {
    const goals = makeGoals();
    const isOwner = true;
    const filterAssignee = 20 as number | string;
    const employeeId = 1;

    let filtered = [...goals];
    if (isOwner) {
      if (filterAssignee !== "all") {
        filtered = filtered.filter((g) => g.assignedTo === filterAssignee);
      }
    } else {
      filtered = filtered.filter((g) => g.assignedTo === employeeId);
    }

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Order lumber");
  });

  it("secretary only sees goals assigned to them", () => {
    const goals = makeGoals();
    const isOwner = false;
    const employeeId = 20; // secretary's ID

    let filtered = [...goals];
    if (isOwner) {
      // owner path
    } else {
      filtered = filtered.filter((g) => g.assignedTo === employeeId);
    }

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Order lumber");
  });

  it("foreman only sees goals assigned to them", () => {
    const goals = makeGoals();
    const isOwner = false;
    const employeeId = 10; // foreman's ID

    let filtered = [...goals];
    if (isOwner) {
      // owner path
    } else {
      filtered = filtered.filter((g) => g.assignedTo === employeeId);
    }

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Frame walls");
  });

  it("logistics only sees goals assigned to them", () => {
    const goals = makeGoals();
    const isOwner = false;
    const employeeId = 30; // logistics ID

    let filtered = [...goals];
    if (isOwner) {
      // owner path
    } else {
      filtered = filtered.filter((g) => g.assignedTo === employeeId);
    }

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Review budget");
  });

  it("laborer is excluded from goals tab entirely", () => {
    const role: string = "laborer";
    const canViewGoals = role === "owner" || role === "secretary" || role === "logistics" || role === "foreman";
    expect(canViewGoals).toBe(false);
  });
});

// ─── Reports Access Logic ────────────────────────────────────────────────────

describe("Reports access rules", () => {
  const testCanSubmit = (role: string) => {
    return role === "foreman" || role === "laborer" || role === "logistics" || role === "owner" || role === "secretary";
  };

  it("foreman can submit reports", () => {
    expect(testCanSubmit("foreman")).toBe(true);
  });

  it("laborer can submit reports", () => {
    expect(testCanSubmit("laborer")).toBe(true);
  });

  it("logistics can submit reports", () => {
    expect(testCanSubmit("logistics")).toBe(true);
  });

  it("owner can submit reports", () => {
    expect(testCanSubmit("owner")).toBe(true);
  });

  it("secretary can submit reports", () => {
    expect(testCanSubmit("secretary")).toBe(true);
  });
});

// ─── Clock Management Access Logic ───────────────────────────────────────────

describe("Clock management access rules", () => {
  const isManager = (role: string) => role === "owner" || role === "secretary" || role === "logistics";

  it("owner can manage clocks", () => {
    expect(isManager("owner")).toBe(true);
  });

  it("secretary can manage clocks", () => {
    expect(isManager("secretary")).toBe(true);
  });

  it("logistics can manage clocks", () => {
    expect(isManager("logistics")).toBe(true);
  });

  it("foreman cannot manage clocks (uses self-clock)", () => {
    expect(isManager("foreman")).toBe(false);
  });

  it("laborer cannot manage clocks (uses self-clock)", () => {
    expect(isManager("laborer")).toBe(false);
  });

  it("manager clock target is selected employee, not self", () => {
    const role = "owner";
    const selfId = 1;
    const selectedEmployeeId = 5;
    const clockTargetId = isManager(role) ? selectedEmployeeId : selfId;
    expect(clockTargetId).toBe(5);
  });

  it("field role clock target is self", () => {
    const role = "foreman";
    const selfId = 1;
    const selectedEmployeeId = 5;
    const clockTargetId = isManager(role) ? selectedEmployeeId : selfId;
    expect(clockTargetId).toBe(1);
  });
});

// ─── Labor Cost Dashboard Helpers ────────────────────────────────────────────

describe("Labor cost dashboard helpers", () => {
  it("formatCurrency formats correctly", () => {
    const formatCurrency = (amount: number) =>
      "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    expect(formatCurrency(1500)).toBe("$1,500");
    expect(formatCurrency(0)).toBe("$0");
    expect(formatCurrency(25000)).toBe("$25,000");
  });

  it("formatHours formats correctly", () => {
    const formatHours = (minutes: number) => {
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hrs === 0) return `${mins}m`;
      if (mins === 0) return `${hrs}h`;
      return `${hrs}h ${mins}m`;
    };
    expect(formatHours(0)).toBe("0m");
    expect(formatHours(30)).toBe("30m");
    expect(formatHours(60)).toBe("1h");
    expect(formatHours(90)).toBe("1h 30m");
    expect(formatHours(480)).toBe("8h");
  });

  it("getDateRange returns correct range for week", () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    // Monday should be day 1
    expect(start.getDay()).toBe(1);
  });

  it("only owner sees dollar amounts", () => {
    const canSeeDollars = (role: string) => role === "owner";
    expect(canSeeDollars("owner")).toBe(true);
    expect(canSeeDollars("secretary")).toBe(false);
    expect(canSeeDollars("logistics")).toBe(false);
  });

  it("labor dashboard access restricted to management", () => {
    const canAccess = (role: string) => role === "owner" || role === "secretary" || role === "logistics";
    expect(canAccess("owner")).toBe(true);
    expect(canAccess("secretary")).toBe(true);
    expect(canAccess("logistics")).toBe(true);
    expect(canAccess("foreman")).toBe(false);
    expect(canAccess("laborer")).toBe(false);
  });
});

// ─── Tab Visibility ──────────────────────────────────────────────────────────

describe("Tab visibility by role", () => {
  const getVisibleTabs = (role: string) => {
    const canManageTeam = role === "owner" || role === "secretary" || role === "logistics";
    const canViewPayroll = role === "owner" || role === "secretary";
    const canMeetings = role === "owner" || role === "secretary" || role === "logistics" || role === "foreman";
    const canViewGoals = role === "owner" || role === "secretary" || role === "logistics" || role === "foreman";
    const canViewLaborCosts = role === "owner" || role === "secretary" || role === "logistics";
    const canViewKpis = role === "owner" || role === "secretary" || role === "logistics" || role === "foreman";
    const isFieldRole = role === "foreman" || role === "laborer";

    const tabs = ["Dashboard", "Jobs", "Clock", "Reports", "Profile"];
    if (isFieldRole) tabs.push("My Hours");
    if (canMeetings) tabs.push("Meetings");
    if (canViewGoals) tabs.push("Goals");
    if (canViewLaborCosts) tabs.push("Labor $");
    if (canViewKpis) tabs.push("KPIs");
    if (canViewPayroll) tabs.push("Payroll");
    if (canManageTeam) tabs.push("Team");
    return tabs;
  };

  it("laborer does NOT see Goals tab", () => {
    const tabs = getVisibleTabs("laborer");
    expect(tabs).not.toContain("Goals");
  });

  it("foreman sees Goals tab", () => {
    const tabs = getVisibleTabs("foreman");
    expect(tabs).toContain("Goals");
  });

  it("all roles see Clock tab", () => {
    for (const role of ["owner", "secretary", "logistics", "foreman", "laborer"]) {
      const tabs = getVisibleTabs(role);
      expect(tabs).toContain("Clock");
    }
  });

  it("owner sees Labor $ tab", () => {
    const tabs = getVisibleTabs("owner");
    expect(tabs).toContain("Labor $");
  });

  it("laborer does NOT see Labor $ tab", () => {
    const tabs = getVisibleTabs("laborer");
    expect(tabs).not.toContain("Labor $");
  });
});
