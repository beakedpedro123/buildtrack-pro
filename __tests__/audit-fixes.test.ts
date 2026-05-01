import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const routersPath = path.join(__dirname, "..", "server", "routers.ts");
const dbPath = path.join(__dirname, "..", "server", "db.ts");
const payrollPdfPath = path.join(__dirname, "..", "server", "payroll-pdf.ts");
const budgetReportPdfPath = path.join(__dirname, "..", "server", "budget-report-pdf.ts");
const fieldReportsPdfPath = path.join(__dirname, "..", "server", "field-reports-pdf.ts");
const schedulePath = path.join(__dirname, "..", "app", "(tabs)", "schedule.tsx");
const goalsPath = path.join(__dirname, "..", "app", "(tabs)", "goals.tsx");
const jobsPath = path.join(__dirname, "..", "app", "(tabs)", "jobs.tsx");
const schemaPath = path.join(__dirname, "..", "drizzle", "schema.ts");

describe("Gemini Audit Fix #1: updateSubscription must be adminProcedure", () => {
  it("should use adminProcedure for updateSubscription", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // Find the updateSubscription definition
    const match = content.match(/updateSubscription:\s*(admin|public)Procedure/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("admin");
  });
});

describe("Gemini Audit Fix #2: Math.round instead of Math.floor for payroll minutes", () => {
  it("should use Math.round for duration-to-minutes in payroll-pdf.ts", () => {
    const content = fs.readFileSync(payrollPdfPath, "utf-8");
    // Check that duration/60000 calculations use Math.round, not Math.floor
    const durationCalcs = content.match(/Math\.(floor|round)\(.*\/\s*60000/g) || [];
    for (const calc of durationCalcs) {
      expect(calc).toContain("Math.round");
    }
  });

  it("should use Math.round for duration-to-minutes in budget-report-pdf.ts", () => {
    const content = fs.readFileSync(budgetReportPdfPath, "utf-8");
    const durationCalcs = content.match(/Math\.(floor|round)\(.*\/\s*60000/g) || [];
    for (const calc of durationCalcs) {
      expect(calc).toContain("Math.round");
    }
  });

  it("should use Math.round for duration-to-minutes in field-reports-pdf.ts", () => {
    const content = fs.readFileSync(fieldReportsPdfPath, "utf-8");
    const durationCalcs = content.match(/Math\.(floor|round)\(.*\/\s*60000/g) || [];
    for (const calc of durationCalcs) {
      expect(calc).toContain("Math.round");
    }
  });

  it("should use Math.round for duration-to-minutes in routers.ts payroll section", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // Find the payroll query section (getPayrollData)
    const payrollSection = content.match(/getPayrollData[\s\S]*?return \{ rows/);
    if (payrollSection) {
      const durationCalcs = payrollSection[0].match(/Math\.(floor|round)\(.*\/\s*60000/g) || [];
      for (const calc of durationCalcs) {
        expect(calc).toContain("Math.round");
      }
    }
  });
});

describe("Gemini Audit Fix #3: companyId falsy check in savePivotConversation", () => {
  it("should use !== undefined instead of falsy check for companyId in db.ts", () => {
    const content = fs.readFileSync(dbPath, "utf-8");
    // Find the savePivotConversation function and check it uses !== undefined
    const saveSection = content.match(/savePivotConversation[\s\S]*?companyId[\s\S]*?(!==\s*undefined|!\s*companyId)/);
    expect(saveSection).not.toBeNull();
    expect(saveSection![0]).toContain("!== undefined");
  });
});

describe("CompanyId Guards on Job Mutations", () => {
  it("jobs.create should include ctx.companyId", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // Find the jobs create mutation — uses protectedProcedure (more secure than publicProcedure)
    // protectedProcedure binds companyId from the authenticated user's DB record, not from headers
    const createSection = content.match(/create:\s*protectedProcedure[\s\S]*?\.mutation\(\s*(?:async\s*)?\(\s*\{\s*input\s*,\s*ctx\s*\}/);
    expect(createSection).not.toBeNull();
    // Check that companyId from ctx is included in the data spread
    const dataLine = content.match(/const data = \{.*companyId:\s*ctx\.companyId/);
    expect(dataLine).not.toBeNull();
    // Check that createJob is called with the data (may be via result variable)
    const createJobCall = content.match(/db\.createJob\(data\)/);
    expect(createJobCall).not.toBeNull();
  });

  it("jobs.update should verify job ownership via companyId", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // Find the update mutation section — uses protectedProcedure with verifyJobOwnership
    const updateSection = content.match(/update:\s*protectedProcedure[\s\S]*?verifyJobOwnership\(input\.id,\s*ctx\.companyId\)/);
    expect(updateSection).not.toBeNull();
  });
});

describe("Crew Assignment Feature", () => {
  it("should have assignedCrew column in drizzle schema", () => {
    const content = fs.readFileSync(schemaPath, "utf-8");
    expect(content).toContain("assignedCrew");
  });

  it("should accept assignedCrew in jobs.create mutation", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // Uses protectedProcedure (secure) — check that assignedCrew is in the jobs create input schema
    const createSection = content.match(/create:\s*protectedProcedure\.input\(z\.object\(\{[\s\S]*?assignedCrew/);
    expect(createSection).not.toBeNull();
  });

  it("should accept assignedCrew in jobs.update mutation", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    // Uses protectedProcedure (secure) — check that assignedCrew is in the jobs update input schema
    const updateSection = content.match(/update:\s*protectedProcedure\.input\(z\.object\(\{[\s\S]*?assignedCrew/);
    expect(updateSection).not.toBeNull();
  });

  it("should have crew selection UI in jobs.tsx", () => {
    const content = fs.readFileSync(jobsPath, "utf-8");
    expect(content).toContain("jobCrewIds");
    expect(content).toContain("Assign Crew");
  });
});

describe("Schedule Planner Tab", () => {
  it("should have planner view mode in schedule.tsx", () => {
    const content = fs.readFileSync(schedulePath, "utf-8");
    expect(content).toContain("planner");
    expect(content).toContain("BudgetPlannerView");
  });

  it("should have syncGoalsMutation in schedule.tsx", () => {
    const content = fs.readFileSync(schedulePath, "utf-8");
    expect(content).toContain("syncGoalsMutation");
    expect(content).toContain("goals.syncFromSchedule");
  });

  it("should have profit timeline calculations in BudgetPlannerView", () => {
    const content = fs.readFileSync(schedulePath, "utf-8");
    expect(content).toContain("profitDays");
    expect(content).toContain("dailyLaborCost");
    expect(content).toContain("dailyOverhead");
    expect(content).toContain("dailyTotalCost");
  });
});

describe("Goals Tab Redesign", () => {
  it("should have collapsible employee sections", () => {
    const content = fs.readFileSync(goalsPath, "utf-8");
    expect(content).toContain("expandedEmployees");
    expect(content).toContain("toggleEmployee");
  });

  it("should have expand/collapse all functionality", () => {
    const content = fs.readFileSync(goalsPath, "utf-8");
    expect(content).toContain("Expand All");
  });

  it("should have compact goal rows with priority indicators", () => {
    const content = fs.readFileSync(goalsPath, "utf-8");
    // Check for priority color strip
    expect(content).toContain("PRIORITY_STRIP");
  });

  it("should still have punch list functionality", () => {
    const content = fs.readFileSync(goalsPath, "utf-8");
    expect(content).toContain("Punch List");
    expect(content).toContain("punchItems");
  });
});

describe("Pivot Enhanced Job Creation", () => {
  it("should accept assignedCrewIds in create_job_with_budget tool", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("assignedCrewIds");
  });

  it("should calculate real daily labor cost from crew rates", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("realDailyLaborCost");
    expect(content).toContain("realDailyOverhead");
  });

  it("should include profit timeline in Pivot job creation result", () => {
    const content = fs.readFileSync(routersPath, "utf-8");
    expect(content).toContain("Profit Timeline");
    expect(content).toContain("profitableDays");
    expect(content).toContain("bufferDays");
  });
});
