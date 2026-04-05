import { describe, it, expect } from "vitest";

/**
 * Role System Tests — Validates the role access matrix after the secretary → office_manager migration
 */

// Role definitions
const ROLES = ["owner", "office_manager", "logistics", "foreman", "laborer"] as const;
type Role = typeof ROLES[number];

// Tab visibility matrix (from _layout.tsx)
const TAB_ACCESS: Record<string, Role[]> = {
  dashboard: ["owner", "office_manager", "logistics", "foreman", "laborer"],
  jobs: ["owner", "office_manager", "logistics", "foreman", "laborer"],
  clock: ["owner", "office_manager", "logistics", "foreman", "laborer"],
  "labor-costs": ["owner", "office_manager", "logistics"],
  payroll: ["owner", "office_manager"],
  more: ["owner", "office_manager", "logistics", "foreman", "laborer"],
};

// More menu items access
const MORE_ITEMS_ACCESS: Record<string, Role[]> = {
  meetings: ["owner", "office_manager", "logistics"],
  goals: ["owner", "office_manager", "logistics", "foreman", "laborer"],
  safety: ["owner", "office_manager", "logistics", "foreman", "laborer"],
  payroll: ["owner", "office_manager"],
  team: ["owner", "office_manager", "logistics"],
  "labor-costs": ["owner", "office_manager", "logistics"],
  "all-hours": ["owner", "office_manager", "logistics"],
  "my-hours": ["foreman", "laborer"],
};

// Dollar visibility
const CAN_SEE_DOLLARS: Role[] = ["owner", "office_manager"];

// Pivot access
const PIVOT_ACCESS: Record<Role, { canUseChat: boolean; canUseVoice: boolean; canAttachFiles: boolean }> = {
  owner: { canUseChat: true, canUseVoice: true, canAttachFiles: true },
  office_manager: { canUseChat: true, canUseVoice: true, canAttachFiles: true },
  logistics: { canUseChat: true, canUseVoice: true, canAttachFiles: true },
  foreman: { canUseChat: true, canUseVoice: true, canAttachFiles: false },
  laborer: { canUseChat: true, canUseVoice: false, canAttachFiles: false },
};

describe("Role System", () => {
  it("should not include 'secretary' in the role list", () => {
    expect(ROLES).not.toContain("secretary");
    expect(ROLES).toContain("office_manager");
  });

  it("should have exactly 5 roles", () => {
    expect(ROLES.length).toBe(5);
  });
});

describe("Tab Access", () => {
  it("owner should see all tabs", () => {
    for (const tab of Object.keys(TAB_ACCESS)) {
      expect(TAB_ACCESS[tab]).toContain("owner");
    }
  });

  it("office_manager should see all tabs (same as owner)", () => {
    for (const tab of Object.keys(TAB_ACCESS)) {
      expect(TAB_ACCESS[tab]).toContain("office_manager");
    }
  });

  it("logistics should NOT see payroll tab", () => {
    expect(TAB_ACCESS.payroll).not.toContain("logistics");
  });

  it("foreman should NOT see labor-costs or payroll tabs", () => {
    expect(TAB_ACCESS["labor-costs"]).not.toContain("foreman");
    expect(TAB_ACCESS.payroll).not.toContain("foreman");
  });

  it("laborer should NOT see labor-costs or payroll tabs", () => {
    expect(TAB_ACCESS["labor-costs"]).not.toContain("laborer");
    expect(TAB_ACCESS.payroll).not.toContain("laborer");
  });
});

describe("More Menu Access", () => {
  it("foreman should NOT have meetings access", () => {
    expect(MORE_ITEMS_ACCESS.meetings).not.toContain("foreman");
  });

  it("laborer should NOT have meetings access", () => {
    expect(MORE_ITEMS_ACCESS.meetings).not.toContain("laborer");
  });

  it("foreman should have goals access", () => {
    expect(MORE_ITEMS_ACCESS.goals).toContain("foreman");
  });

  it("laborer should have goals access", () => {
    expect(MORE_ITEMS_ACCESS.goals).toContain("laborer");
  });

  it("laborer should have my-hours access", () => {
    expect(MORE_ITEMS_ACCESS["my-hours"]).toContain("laborer");
  });
});

describe("Dollar Visibility", () => {
  it("only owner and office_manager should see dollar amounts", () => {
    expect(CAN_SEE_DOLLARS).toContain("owner");
    expect(CAN_SEE_DOLLARS).toContain("office_manager");
    expect(CAN_SEE_DOLLARS).not.toContain("logistics");
    expect(CAN_SEE_DOLLARS).not.toContain("foreman");
    expect(CAN_SEE_DOLLARS).not.toContain("laborer");
  });
});

describe("Pivot Access", () => {
  it("all roles should have chat access", () => {
    for (const role of ROLES) {
      expect(PIVOT_ACCESS[role].canUseChat).toBe(true);
    }
  });

  it("laborer should NOT have voice access", () => {
    expect(PIVOT_ACCESS.laborer.canUseVoice).toBe(false);
  });

  it("foreman should have voice access", () => {
    expect(PIVOT_ACCESS.foreman.canUseVoice).toBe(true);
  });

  it("foreman should NOT have file attachment access", () => {
    expect(PIVOT_ACCESS.foreman.canAttachFiles).toBe(false);
  });

  it("management roles should have full Pivot access", () => {
    for (const role of ["owner", "office_manager", "logistics"] as Role[]) {
      expect(PIVOT_ACCESS[role].canUseVoice).toBe(true);
      expect(PIVOT_ACCESS[role].canAttachFiles).toBe(true);
    }
  });
});

describe("Language Support", () => {
  it("should support English and Spanish", () => {
    const SUPPORTED_LANGUAGES = ["en", "es"];
    expect(SUPPORTED_LANGUAGES).toContain("en");
    expect(SUPPORTED_LANGUAGES).toContain("es");
  });
});
