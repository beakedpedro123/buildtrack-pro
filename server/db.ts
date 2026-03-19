import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertBudgetCategory,
  InsertClockEntry,
  InsertDailyReport,
  InsertEmployee,
  InsertExpense,
  InsertJob,
  InsertJobAssignment,
  InsertMaterialEntry,
  InsertReportPhoto,
  InsertUser,
  budgetCategories,
  clockEntries,
  dailyReports,
  employees,
  expenses,
  jobAssignments,
  jobs,
  materialEntries,
  qbSyncLog,
  reportPhotos,
  users,
  meetings,
  weeklyGoals,
  InsertMeeting,
  InsertWeeklyGoal,
  qbEstimates,
  kpiMetrics,
  kpiHistory,
  InsertQbEstimate,
  InsertKpiMetric,
  InsertKpiHistory,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Users
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Employees
export async function getAllEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees).where(eq(employees.isActive, true)).orderBy(employees.name);
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0];
}

export async function getEmployeeByPin(pin: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees)
    .where(and(eq(employees.pin, pin), eq(employees.isActive, true))).limit(1);
  return result[0];
}

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employees).values(data);
  return result[0].insertId;
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set(data).where(eq(employees.id, id));
}

export async function deactivateEmployee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ isActive: false }).where(eq(employees.id, id));
}

// Jobs
export async function getAllJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).orderBy(desc(jobs.createdAt));
}

export async function getActiveJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).where(eq(jobs.status, "active")).orderBy(jobs.name);
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return result[0];
}

export async function createJob(data: InsertJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(jobs).values(data);
  return result[0].insertId;
}

export async function updateJob(id: number, data: Partial<InsertJob>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(jobs).set(data).where(eq(jobs.id, id));
}

export async function getJobsForEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  const assignments = await db.select().from(jobAssignments)
    .where(eq(jobAssignments.employeeId, employeeId));
  if (assignments.length === 0) return [];
  const jobIds = assignments.map((a) => a.jobId);
  return db.select().from(jobs).where(
    and(or(...jobIds.map((id) => eq(jobs.id, id))), eq(jobs.status, "active"))
  );
}

// Job Assignments
export async function assignEmployeeToJob(data: InsertJobAssignment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(jobAssignments).values(data);
}

export async function getJobAssignments(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobAssignments).where(eq(jobAssignments.jobId, jobId));
}

export async function removeJobAssignment(jobId: number, employeeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.employeeId, employeeId)));
}

// Clock Entries
export async function clockIn(data: InsertClockEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.localId) {
    const existing = await db.select().from(clockEntries)
      .where(eq(clockEntries.localId, data.localId)).limit(1);
    if (existing.length > 0) return existing[0].id;
  }
  const result = await db.insert(clockEntries).values(data);
  return result[0].insertId;
}

export async function clockOut(entryId: number, clockOutTime: Date, lat?: number, lng?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clockEntries).set({
    clockOut: clockOutTime,
    clockOutLatitude: lat,
    clockOutLongitude: lng,
  }).where(eq(clockEntries.id, entryId));
}

export async function getActiveClockEntry(employeeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clockEntries)
    .where(and(eq(clockEntries.employeeId, employeeId), isNull(clockEntries.clockOut)))
    .orderBy(desc(clockEntries.clockIn)).limit(1);
  return result[0];
}

export async function getClockEntriesForEmployee(employeeId: number, since?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [eq(clockEntries.employeeId, employeeId)];
  if (since) conditions.push(gte(clockEntries.clockIn, since) as any);
  return db.select().from(clockEntries).where(and(...conditions)).orderBy(desc(clockEntries.clockIn));
}

export async function getClockEntriesForJob(jobId: number, date?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(clockEntries.jobId, jobId)];
  if (date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    conditions.push(gte(clockEntries.clockIn, start), lte(clockEntries.clockIn, end));
  }
  return db.select().from(clockEntries).where(and(...conditions)).orderBy(desc(clockEntries.clockIn));
}

export async function getClockedInEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clockEntries).where(isNull(clockEntries.clockOut));
}

// Daily Reports
export async function createDailyReport(data: InsertDailyReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dailyReports).values(data);
  return result[0].insertId;
}

export async function getDailyReportsForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dailyReports).where(eq(dailyReports.jobId, jobId))
    .orderBy(desc(dailyReports.reportDate));
}

export async function getDailyReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(dailyReports).where(eq(dailyReports.id, id)).limit(1);
  return result[0];
}

export async function getRecentReports(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dailyReports).orderBy(desc(dailyReports.reportDate)).limit(limit);
}

// Material Entries
export async function addMaterialEntry(data: InsertMaterialEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(materialEntries).values(data);
  return result[0].insertId;
}

export async function getMaterialsForReport(reportId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(materialEntries).where(eq(materialEntries.reportId, reportId));
}

export async function getMaterialsForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(materialEntries).where(eq(materialEntries.jobId, jobId))
    .orderBy(desc(materialEntries.createdAt));
}

// Report Photos
export async function addReportPhoto(data: InsertReportPhoto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reportPhotos).values(data);
  return result[0].insertId;
}

export async function getPhotosForReport(reportId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reportPhotos).where(eq(reportPhotos.reportId, reportId));
}

export async function getPhotosForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reportPhotos).where(eq(reportPhotos.jobId, jobId))
    .orderBy(desc(reportPhotos.createdAt));
}

// Budget Categories
export async function createBudgetCategory(data: InsertBudgetCategory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(budgetCategories).values(data);
  return result[0].insertId;
}

export async function getBudgetCategoriesForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetCategories).where(eq(budgetCategories.jobId, jobId));
}

export async function updateBudgetCategory(id: number, data: Partial<InsertBudgetCategory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(budgetCategories).set(data).where(eq(budgetCategories.id, id));
}

// Expenses
export async function createExpense(data: InsertExpense) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(expenses).values(data);
  return result[0].insertId;
}

export async function getExpensesForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenses).where(eq(expenses.jobId, jobId))
    .orderBy(desc(expenses.expenseDate));
}

export async function getUnsyncedExpenses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenses).where(eq(expenses.qbSynced, false));
}

export async function markExpenseSynced(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(expenses).set({ qbSynced: true, qbSyncedAt: new Date() }).where(eq(expenses.id, id));
}

// QuickBooks Sync Log
export async function createSyncLog(data: Omit<typeof qbSyncLog.$inferInsert, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(qbSyncLog).values(data);
  return result[0].insertId;
}

export async function updateSyncLog(id: number, data: Partial<typeof qbSyncLog.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(qbSyncLog).set(data).where(eq(qbSyncLog.id, id));
}

export async function getRecentSyncLogs(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(qbSyncLog).orderBy(desc(qbSyncLog.createdAt)).limit(limit);
}
// ─── Meetings ─────────────────────────────────────────────────────────────────
export async function createMeeting(data: Omit<InsertMeeting, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(meetings).values(data);
  return result[0].insertId as number;
}

export async function getMeetings(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(meetings).orderBy(desc(meetings.createdAt)).limit(limit);
}

export async function getMeetingById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
  return rows[0] || null;
}

export async function updateMeeting(id: number, data: Partial<InsertMeeting>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(meetings).set(data).where(eq(meetings.id, id));
}

// ─── Weekly Goals ──────────────────────────────────────────────────────────

export async function createWeeklyGoal(data: Omit<InsertWeeklyGoal, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(weeklyGoals).values(data);
  return result[0].insertId as number;
}

export async function getWeeklyGoals(weekOf?: Date) {
  const db = await getDb();
  if (!db) return [];
  if (weekOf) {
    // Get goals for the week containing weekOf
    const start = new Date(weekOf);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return db.select().from(weeklyGoals)
      .where(and(gte(weeklyGoals.weekOf, start), lte(weeklyGoals.weekOf, end)))
      .orderBy(weeklyGoals.priority, weeklyGoals.createdAt);
  }
  return db.select().from(weeklyGoals).orderBy(desc(weeklyGoals.createdAt)).limit(50);
}

export async function getGoalsForMeeting(meetingId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weeklyGoals).where(eq(weeklyGoals.meetingId, meetingId));
}

export async function updateWeeklyGoal(id: number, data: Partial<InsertWeeklyGoal>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(weeklyGoals).set(data).where(eq(weeklyGoals.id, id));
}

export async function deleteWeeklyGoal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(weeklyGoals).where(eq(weeklyGoals.id, id));
}

// ─── Payroll / Hours helpers ───────────────────────────────────────────────

export async function getClockEntriesForPayroll(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clockEntries)
    .where(and(gte(clockEntries.clockIn, startDate), lte(clockEntries.clockIn, endDate)))
    .orderBy(clockEntries.employeeId, clockEntries.clockIn);
}

export async function getClockEntriesForEmployeePeriod(employeeId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clockEntries)
    .where(and(
      eq(clockEntries.employeeId, employeeId),
      gte(clockEntries.clockIn, startDate),
      lte(clockEntries.clockIn, endDate)
    ))
    .orderBy(desc(clockEntries.clockIn));
}

// ─── QuickBooks Estimates ──────────────────────────────────────────────────
export async function getEstimatesForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(qbEstimates).where(eq(qbEstimates.jobId, jobId)).orderBy(desc(qbEstimates.createdAt));
}
export async function createQbEstimate(data: InsertQbEstimate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(qbEstimates).values(data);
  const [row] = await db.select().from(qbEstimates).where(eq(qbEstimates.jobId, data.jobId)).orderBy(desc(qbEstimates.createdAt)).limit(1);
  return row;
}
export async function updateQbEstimate(id: number, data: Partial<InsertQbEstimate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(qbEstimates).set(data).where(eq(qbEstimates.id, id));
}
export async function deleteQbEstimate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(qbEstimates).where(eq(qbEstimates.id, id));
}

// ─── KPI Metrics ──────────────────────────────────────────────────────────
export async function getAllKpis() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kpiMetrics).where(eq(kpiMetrics.isActive, true)).orderBy(kpiMetrics.category, kpiMetrics.name);
}
export async function getKpiById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(kpiMetrics).where(eq(kpiMetrics.id, id)).limit(1);
  return row ?? null;
}
export async function createKpi(data: InsertKpiMetric) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(kpiMetrics).values(data);
  const [row] = await db.select().from(kpiMetrics).where(eq(kpiMetrics.createdBy, data.createdBy)).orderBy(desc(kpiMetrics.createdAt)).limit(1);
  return row;
}
export async function updateKpi(id: number, data: Partial<InsertKpiMetric>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(kpiMetrics).set(data).where(eq(kpiMetrics.id, id));
}
export async function deleteKpi(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(kpiMetrics).set({ isActive: false }).where(eq(kpiMetrics.id, id));
}

// ─── KPI History ──────────────────────────────────────────────────────────
export async function getKpiHistory(kpiId: number, limit = 12) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kpiHistory).where(eq(kpiHistory.kpiId, kpiId)).orderBy(desc(kpiHistory.recordedAt)).limit(limit);
}
export async function addKpiHistoryEntry(data: InsertKpiHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(kpiHistory).values(data);
  // Also update the current value on the KPI metric
  await db.update(kpiMetrics).set({ currentValue: data.value, updatedBy: data.recordedBy }).where(eq(kpiMetrics.id, data.kpiId));
}

// ─── Employee Invites ─────────────────────────────────────────────────────
export async function getEmployeeByInviteToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees)
    .where(and(eq(employees.inviteToken, token), eq(employees.inviteStatus, "pending")))
    .limit(1);
  return result[0];
}

export async function acceptInvite(token: string, name: string, pin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const emp = await getEmployeeByInviteToken(token);
  if (!emp) throw new Error("Invalid or expired invite token");
  await db.update(employees).set({
    name,
    pin,
    inviteStatus: "accepted",
  }).where(eq(employees.id, emp.id));
  return emp.id;
}

// ─── Labor Cost for Job ──────────────────────────────────────────────────
export async function getLaborCostForJob(jobId: number) {
  const db = await getDb();
  if (!db) return { totalMinutes: 0, totalCost: 0 };
  const entries = await db.select().from(clockEntries)
    .where(eq(clockEntries.jobId, jobId));
  const allEmployees = await db.select().from(employees);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  let totalMinutes = 0;
  let totalCost = 0;
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const mins = Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000);
    totalMinutes += mins;
    const emp = empMap.get(entry.employeeId);
    if (emp?.hourlyRate) {
      totalCost += (mins / 60) * parseFloat(emp.hourlyRate);
    }
  }
  return { totalMinutes, totalCost: Math.round(totalCost * 100) / 100 };
}
