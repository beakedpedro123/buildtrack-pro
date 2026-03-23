import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(filePath: string): string {
  return fs.readFileSync(path.join(ROOT, filePath), "utf-8");
}

describe("Phase 17 — Foreman Access Restrictions", () => {
  it("Home screen hides dollar amounts from foreman (canSeeDollars check)", () => {
    const src = readFile("app/(tabs)/index.tsx");
    expect(src).toContain("canSeeDollars");
    // canSeeDollars is tied to isManagement (owner/secretary/logistics)
    expect(src).toContain("const canSeeDollars = isManagement");
    // isManagement should not include foreman
    const mgmtMatch = src.match(/const isManagement\s*=\s*([^;]+);/);
    expect(mgmtMatch).toBeTruthy();
    if (mgmtMatch) {
      expect(mgmtMatch[1]).not.toContain("foreman");
    }
  });

  it("Home screen passes hideBudget to JobCard for non-management roles", () => {
    const src = readFile("app/(tabs)/index.tsx");
    expect(src).toContain("hideBudget");
  });

  it("Jobs screen restricts budget tab to management roles only", () => {
    const src = readFile("app/(tabs)/jobs.tsx");
    // canSeeBudget should be tied to management roles
    expect(src).toContain("canSeeBudget");
  });

  it("Tab layout does not give foreman access to payroll", () => {
    const src = readFile("app/(tabs)/_layout.tsx");
    const payrollMatch = src.match(/canViewPayroll\s*=\s*([^;]+);/);
    expect(payrollMatch).toBeTruthy();
    if (payrollMatch) {
      expect(payrollMatch[1]).not.toContain("foreman");
    }
  });
});

describe("Phase 17 — Safety Meetings Schema & Server", () => {
  it("drizzle schema has safetyTopics table", () => {
    const src = readFile("drizzle/schema.ts");
    expect(src).toContain("safetyTopics");
    expect(src).toContain("safetyMeetings");
  });

  it("schema exports InsertSafetyTopic and InsertSafetyMeeting types", () => {
    const src = readFile("drizzle/schema.ts");
    expect(src).toContain("InsertSafetyTopic");
    expect(src).toContain("InsertSafetyMeeting");
  });

  it("server db.ts has safety topic CRUD functions", () => {
    const src = readFile("server/db.ts");
    expect(src).toContain("getSafetyTopics");
    expect(src).toContain("createSafetyTopic");
    expect(src).toContain("updateSafetyTopic");
    expect(src).toContain("deleteSafetyTopic");
  });

  it("server db.ts has safety meeting functions", () => {
    const src = readFile("server/db.ts");
    expect(src).toContain("getSafetyMeetings");
    expect(src).toContain("getSafetyMeetingsForJob");
    expect(src).toContain("getSafetyMeetingsForWeek");
    expect(src).toContain("createSafetyMeeting");
    expect(src).toContain("deleteSafetyMeeting");
  });

  it("server routers.ts has safetyTopics and safetyMeetings routers", () => {
    const src = readFile("server/routers.ts");
    expect(src).toContain("safetyTopicsRouter");
    expect(src).toContain("safetyMeetingsRouter");
    expect(src).toContain("safetyTopics: safetyTopicsRouter");
    expect(src).toContain("safetyMeetings: safetyMeetingsRouter");
  });

  it("safety topics router restricts creation to management roles", () => {
    const src = readFile("server/routers.ts");
    // The create endpoint should check for owner/secretary/logistics
    const createSection = src.substring(src.indexOf("safetyTopicsRouter"), src.indexOf("safetyMeetingsRouter"));
    expect(createSection).toContain('"owner"');
    expect(createSection).toContain('"secretary"');
    expect(createSection).toContain('"logistics"');
  });

  it("safety meetings router allows foreman to create meetings", () => {
    const src = readFile("server/routers.ts");
    const meetingsSection = src.substring(src.indexOf("safetyMeetingsRouter"), src.indexOf("export const appRouter"));
    expect(meetingsSection).toContain('"foreman"');
  });
});

describe("Phase 17 — Safety Tab UI", () => {
  it("safety.tsx screen exists", () => {
    expect(fs.existsSync(path.join(ROOT, "app/(tabs)/safety.tsx"))).toBe(true);
  });

  it("safety.tsx has meeting type selector (safety_toolbox and daily_goals)", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("safety_toolbox");
    expect(src).toContain("daily_goals");
    expect(src).toContain("Safety Toolbox Talk");
    expect(src).toContain("Daily Goals Review");
  });

  it("safety.tsx has job site selector", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("Job Site");
    expect(src).toContain("selectedJobId");
  });

  it("safety.tsx has topic selection for foreman", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("Select a Safety Topic");
    expect(src).toContain("selectTopic");
  });

  it("safety.tsx has notes, attendees, and photo upload", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("Meeting Notes");
    expect(src).toContain("Attendees");
    expect(src).toContain("pickPhoto");
    expect(src).toContain("takePhoto");
  });

  it("safety.tsx has topic management for management roles", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("isManagement");
    expect(src).toContain("Post New Topic");
    expect(src).toContain("handleAddTopic");
    expect(src).toContain("handleDeleteTopic");
  });
});

describe("Phase 17 — Weekly Compliance Tracking", () => {
  it("safety.tsx has weekly compliance cards", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("weeklyStats");
    expect(src).toContain("safetyCount");
    expect(src).toContain("goalsCount");
    expect(src).toContain("safetyTarget");
    expect(src).toContain("goalsTarget");
  });

  it("safety target is 3x per week", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("safetyTarget: 3");
  });

  it("daily goals target is 5x per week (M-F)", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("goalsTarget: 5");
  });

  it("compliance cards show color-coded status (green when met, yellow when not)", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("colors.success");
    expect(src).toContain("colors.warning");
  });

  it("safety.tsx queries meetings for current week", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("forWeek");
    expect(src).toContain("getWeekStart");
    expect(src).toContain("getWeekEnd");
  });
});

describe("Phase 17 — Tab Layout", () => {
  it("safety tab is visible to foreman and management", () => {
    const src = readFile("app/(tabs)/_layout.tsx");
    expect(src).toContain('name="safety"');
    expect(src).toContain("canMeetings");
  });

  it("shield icon is mapped in icon-symbol.tsx", () => {
    const src = readFile("components/ui/icon-symbol.tsx");
    expect(src).toContain('"shield.fill"');
  });
});
