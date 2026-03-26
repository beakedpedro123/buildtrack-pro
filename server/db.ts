import { and, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
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
  safetyTopics,
  safetyMeetings,
  InsertSafetyTopic,
  InsertSafetyMeeting,
  pivotMemory,
  pivotConversations,
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
      .where(and(gte(weeklyGoals.weekOf, start), lt(weeklyGoals.weekOf, end)))
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

// ─── Labor Cost Dashboard Queries ────────────────────────────────────────────

/**
 * Get labor cost breakdown per job for a date range.
 * Returns: array of { jobId, jobName, totalMinutes, totalCost, employeeCount }
 */
export async function getLaborCostByJob(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  const entries = await db.select().from(clockEntries)
    .where(and(gte(clockEntries.clockIn, startDate), lte(clockEntries.clockIn, endDate)));
  const allEmployees = await db.select().from(employees);
  const allJobs = await db.select().from(jobs);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));
  const jobMap = new Map(allJobs.map(j => [j.id, j]));

  const jobAgg: Record<number, { jobId: number; jobName: string; totalMinutes: number; totalCost: number; employeeIds: Set<number> }> = {};
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const mins = Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000);
    if (!jobAgg[entry.jobId]) {
      const job = jobMap.get(entry.jobId);
      jobAgg[entry.jobId] = { jobId: entry.jobId, jobName: job?.name || `Job #${entry.jobId}`, totalMinutes: 0, totalCost: 0, employeeIds: new Set() };
    }
    jobAgg[entry.jobId].totalMinutes += mins;
    jobAgg[entry.jobId].employeeIds.add(entry.employeeId);
    const emp = empMap.get(entry.employeeId);
    if (emp?.hourlyRate) {
      jobAgg[entry.jobId].totalCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
    }
  }
  return Object.values(jobAgg).map(j => {
    const job = jobMap.get(j.jobId);
    const baseLaborCost = Math.round(j.totalCost * 100) / 100;
    const taxRate = parseFloat((job?.taxRate as string) || "0");
    const workersCompRate = parseFloat((job?.workersCompRate as string) || "0");
    const liabilityInsRate = parseFloat((job?.liabilityInsRate as string) || "0");
    const taxCost = Math.round(baseLaborCost * (taxRate / 100) * 100) / 100;
    const workersCompCost = Math.round(baseLaborCost * (workersCompRate / 100) * 100) / 100;
    const liabilityInsCost = Math.round(baseLaborCost * (liabilityInsRate / 100) * 100) / 100;
    const totalWithOverhead = Math.round((baseLaborCost + taxCost + workersCompCost + liabilityInsCost) * 100) / 100;
    return {
      jobId: j.jobId,
      jobName: j.jobName,
      totalMinutes: j.totalMinutes,
      totalCost: baseLaborCost,
      taxRate,
      taxCost,
      workersCompRate,
      workersCompCost,
      liabilityInsRate,
      liabilityInsCost,
      totalWithOverhead,
      employeeCount: j.employeeIds.size,
    };
  }).sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Get weekly labor cost trend for the past N weeks.
 * Returns: array of { weekStart, weekLabel, totalMinutes, totalCost, jobCount }
 */
export async function getWeeklyLaborCostTrend(weeks: number = 8) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  // Go back to the start of the current week (Monday)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() + mondayOffset);
  currentMonday.setHours(0, 0, 0, 0);

  const startDate = new Date(currentMonday);
  startDate.setDate(startDate.getDate() - (weeks - 1) * 7);

  const entries = await db.select().from(clockEntries)
    .where(gte(clockEntries.clockIn, startDate));
  const allEmployees = await db.select().from(employees);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  // Build week buckets
  const weekBuckets: { weekStart: string; weekLabel: string; totalMinutes: number; totalCost: number; jobIds: Set<number> }[] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = new Date(startDate);
    ws.setDate(ws.getDate() + i * 7);
    const month = ws.toLocaleString("en-US", { month: "short" });
    const day = ws.getDate();
    weekBuckets.push({
      weekStart: ws.toISOString(),
      weekLabel: `${month} ${day}`,
      totalMinutes: 0,
      totalCost: 0,
      jobIds: new Set(),
    });
  }

  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const clockInDate = new Date(entry.clockIn);
    const diffDays = Math.floor((clockInDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const bucketIdx = Math.floor(diffDays / 7);
    if (bucketIdx < 0 || bucketIdx >= weeks) continue;

    const mins = Math.floor((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000);
    weekBuckets[bucketIdx].totalMinutes += mins;
    weekBuckets[bucketIdx].jobIds.add(entry.jobId);
    const emp = empMap.get(entry.employeeId);
    if (emp?.hourlyRate) {
      weekBuckets[bucketIdx].totalCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
    }
  }

  return weekBuckets.map(b => ({
    weekStart: b.weekStart,
    weekLabel: b.weekLabel,
    totalMinutes: b.totalMinutes,
    totalCost: Math.round(b.totalCost * 100) / 100,
    jobCount: b.jobIds.size,
  }));
}

/**
 * Get labor cost breakdown per employee for a date range.
 * Returns: array of { employeeId, employeeName, role, hourlyRate, totalMinutes, totalCost }
 */
export async function getLaborCostByEmployee(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  const entries = await db.select().from(clockEntries)
    .where(and(gte(clockEntries.clockIn, startDate), lte(clockEntries.clockIn, endDate)));
  const allEmployees = await db.select().from(employees);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  const empAgg: Record<number, { employeeId: number; employeeName: string; role: string; hourlyRate: string | null; totalMinutes: number; totalCost: number }> = {};
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const mins = Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000);
    if (!empAgg[entry.employeeId]) {
      const emp = empMap.get(entry.employeeId);
      empAgg[entry.employeeId] = {
        employeeId: entry.employeeId,
        employeeName: emp?.name || `Employee #${entry.employeeId}`,
        role: emp?.role || "laborer",
        hourlyRate: emp?.hourlyRate as string | null,
        totalMinutes: 0,
        totalCost: 0,
      };
    }
    empAgg[entry.employeeId].totalMinutes += mins;
    const emp = empMap.get(entry.employeeId);
    if (emp?.hourlyRate) {
      empAgg[entry.employeeId].totalCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
    }
  }
  return Object.values(empAgg).sort((a, b) => b.totalCost - a.totalCost);
}


// ─── Budget Alerts ──────────────────────────────────────────────────────────
/**
 * Get budget alert status for all active jobs.
 * Calculates total spend (labor + overhead + expenses) vs totalBudget.
 * Returns array with alert level: "ok" | "warning" (80%) | "danger" (90%) | "critical" (100%+)
 */
export async function getBudgetAlerts() {
  const db = await getDb();
  if (!db) return [];

  const activeJobsList = await db.select().from(jobs).where(eq(jobs.status, "active"));
  const allClockEntries = await db.select().from(clockEntries);
  const allEmployees = await db.select().from(employees);
  const allExpenses = await db.select().from(expenses);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  const results: {
    jobId: number;
    jobName: string;
    totalBudget: number;
    laborCost: number;
    overheadCost: number;
    expensesCost: number;
    totalSpend: number;
    percentUsed: number;
    alertLevel: "ok" | "warning" | "danger" | "critical";
  }[] = [];

  for (const job of activeJobsList) {
    const budget = parseFloat((job.totalBudget as string) || "0");
    if (budget <= 0) continue; // Skip jobs with no budget set

    // Calculate labor cost for this job
    const jobEntries = allClockEntries.filter(e => e.jobId === job.id && e.clockOut);
    let laborCost = 0;
    for (const entry of jobEntries) {
      const mins = Math.floor((new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime()) / 60000);
      const emp = empMap.get(entry.employeeId);
      if (emp?.hourlyRate) {
        laborCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
      }
    }

    // Calculate overhead
    const taxRate = parseFloat((job.taxRate as string) || "0");
    const workersCompRate = parseFloat((job.workersCompRate as string) || "0");
    const liabilityInsRate = parseFloat((job.liabilityInsRate as string) || "0");
    const overheadCost = laborCost * ((taxRate + workersCompRate + liabilityInsRate) / 100);

    // Calculate expenses
    const jobExpenses = allExpenses.filter(e => e.jobId === job.id);
    const expensesCost = jobExpenses.reduce((sum, e) => sum + parseFloat((e.amount as string) || "0"), 0);

    const totalSpend = laborCost + overheadCost + expensesCost;
    const percentUsed = budget > 0 ? (totalSpend / budget) * 100 : 0;

    let alertLevel: "ok" | "warning" | "danger" | "critical" = "ok";
    if (percentUsed >= 100) alertLevel = "critical";
    else if (percentUsed >= 90) alertLevel = "danger";
    else if (percentUsed >= 80) alertLevel = "warning";

    results.push({
      jobId: job.id,
      jobName: job.name,
      totalBudget: Math.round(budget * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      overheadCost: Math.round(overheadCost * 100) / 100,
      expensesCost: Math.round(expensesCost * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      percentUsed: Math.round(percentUsed * 10) / 10,
      alertLevel,
    });
  }

  return results.sort((a, b) => b.percentUsed - a.percentUsed);
}

// ─── Safety Topics ────────────────────────────────────────────────────────
export async function getSafetyTopics(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(safetyTopics).where(eq(safetyTopics.isActive, true)).orderBy(desc(safetyTopics.createdAt));
  }
  return db.select().from(safetyTopics).orderBy(desc(safetyTopics.createdAt));
}

export async function createSafetyTopic(data: { title: string; content?: string; category?: string; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(safetyTopics).values({
    title: data.title,
    content: data.content || null,
    category: data.category || "general",
    createdBy: data.createdBy,
  });
  return (result as any).insertId as number;
}

export async function updateSafetyTopic(id: number, data: { title?: string; content?: string; category?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return;
  await db.update(safetyTopics).set(data).where(eq(safetyTopics.id, id));
}

export async function deleteSafetyTopic(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(safetyTopics).where(eq(safetyTopics.id, id));
}

// ─── Safety Meetings ──────────────────────────────────────────────────────
export async function getSafetyMeetings(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(safetyMeetings).orderBy(desc(safetyMeetings.conductedAt)).limit(limit);
}

export async function getSafetyMeetingsForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(safetyMeetings).where(eq(safetyMeetings.jobId, jobId)).orderBy(desc(safetyMeetings.conductedAt));
}

export async function getSafetyMeetingsForWeek(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(safetyMeetings)
    .where(and(gte(safetyMeetings.conductedAt, startDate), lte(safetyMeetings.conductedAt, endDate)))
    .orderBy(desc(safetyMeetings.conductedAt));
}

export async function createSafetyMeeting(data: {
  topicId?: number;
  jobId: number;
  meetingType: "safety_toolbox" | "daily_goals";
  title: string;
  notes?: string;
  attendees?: string;
  attendeeCount?: number;
  photoUrl?: string;
  conductedBy: number;
  conductedAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(safetyMeetings).values({
    topicId: data.topicId || null,
    jobId: data.jobId,
    meetingType: data.meetingType,
    title: data.title,
    notes: data.notes || null,
    attendees: data.attendees || null,
    attendeeCount: data.attendeeCount || 0,
    photoUrl: data.photoUrl || null,
    conductedBy: data.conductedBy,
    conductedAt: data.conductedAt,
  });
  return (result as any).insertId as number;
}

export async function deleteSafetyMeeting(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(safetyMeetings).where(eq(safetyMeetings.id, id));
}


// ─── Goals by Employee (for Pivot context) ──────────────────────────────────
export async function getGoalsForEmployee(employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return dbConn.select().from(weeklyGoals)
    .where(
      and(
        gte(weeklyGoals.weekOf, weekStart),
        lt(weeklyGoals.weekOf, weekEnd),
        or(
          eq(weeklyGoals.assignedTo, employeeId),
          isNull(weeklyGoals.assignedTo)
        )
      )
    )
    .orderBy(weeklyGoals.priority, weeklyGoals.createdAt);
}

export async function getAllCurrentWeekGoals() {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return dbConn.select().from(weeklyGoals)
    .where(and(gte(weeklyGoals.weekOf, weekStart), lt(weeklyGoals.weekOf, weekEnd)))
    .orderBy(weeklyGoals.priority, weeklyGoals.createdAt);
}


// ─── Pivot Memory ─────────────────────────────────────────────────────────────
export async function getPivotMemory(employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const rows = await dbConn.select().from(pivotMemory).where(eq(pivotMemory.employeeId, employeeId)).limit(1);
  return rows[0] || null;
}

export async function upsertPivotMemory(employeeId: number, data: {
  conversationSummary?: string;
  preferences?: string;
  ownerPatterns?: string;
  personalProfile?: string;
  communicationStyle?: string;
  growthLog?: string;
  preferredLanguage?: string;
}) {
  const dbConn = await getDb();
  if (!dbConn) return;
  const existing = await getPivotMemory(employeeId);
  if (existing) {
    await dbConn.update(pivotMemory)
      .set({
        ...(data.conversationSummary !== undefined && { conversationSummary: data.conversationSummary }),
        ...(data.preferences !== undefined && { preferences: data.preferences }),
        ...(data.ownerPatterns !== undefined && { ownerPatterns: data.ownerPatterns }),
        ...(data.personalProfile !== undefined && { personalProfile: data.personalProfile }),
        ...(data.communicationStyle !== undefined && { communicationStyle: data.communicationStyle }),
        ...(data.growthLog !== undefined && { growthLog: data.growthLog }),
        ...(data.preferredLanguage !== undefined && { preferredLanguage: data.preferredLanguage }),
        interactionCount: sql`${pivotMemory.interactionCount} + 1`,
        lastInteraction: new Date(),
      })
      .where(eq(pivotMemory.employeeId, employeeId));
  } else {
    await dbConn.insert(pivotMemory).values({
      employeeId,
      conversationSummary: data.conversationSummary || null,
      preferences: data.preferences || null,
      ownerPatterns: data.ownerPatterns || null,
      personalProfile: data.personalProfile || null,
      communicationStyle: data.communicationStyle || null,
      growthLog: data.growthLog || null,
      preferredLanguage: data.preferredLanguage || "en",
      interactionCount: 1,
    });
  }
}

export async function getRecentPivotConversations(employeeId: number, limit = 20) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn.select().from(pivotConversations)
    .where(eq(pivotConversations.employeeId, employeeId))
    .orderBy(desc(pivotConversations.createdAt))
    .limit(limit);
}

export async function savePivotConversation(employeeId: number, role: string, content: string, language = "en") {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.insert(pivotConversations).values({
    employeeId,
    role,
    content,
    language,
  });
}

export async function updatePivotLanguage(employeeId: number, language: string) {
  const dbConn = await getDb();
  if (!dbConn) return;
  await upsertPivotMemory(employeeId, { preferredLanguage: language });
}
