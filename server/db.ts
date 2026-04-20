import { eq, and, or, desc, gte, lte, lt, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
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
  timeAdjustments,
  InsertTimeAdjustment,
  punchListItems,
  InsertPunchListItem,
  messages,
  messageRecipients,
  InsertMessage,
  InsertMessageRecipient,
  changeOrders,
  InsertChangeOrder,
  budgetAuditLog,
  InsertBudgetAuditLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// Override: use local PostgreSQL since the TiDB cluster was deleted
const PG_DATABASE_URL = process.env.PG_DATABASE_URL || "postgresql://buildtrack:buildtrack123@localhost:5432/buildtrack";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: pg.Pool | null = null;
let _lastConnectAttempt = 0;
let _retryCount = 0;
const RETRY_INTERVAL_MS = 10000;
const MAX_RETRY_BACKOFF_MS = 60000;

function createPool() {
  if (!PG_DATABASE_URL) return null;
  try {
    const isLocalhost = PG_DATABASE_URL.includes('localhost') || PG_DATABASE_URL.includes('127.0.0.1');
    const pool = new pg.Pool({
      connectionString: PG_DATABASE_URL,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    return pool;
  } catch (error) {
    console.warn("[Database] Failed to create pool:", error);
    return null;
  }
}

export async function getDb() {
  if (_db && _pool) {
    try {
      await Promise.race([
        _pool.query("SELECT 1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 5000)),
      ]);
      _retryCount = 0;
      return _db;
    } catch {
      console.warn("[Database] Connection lost, will recreate pool...");
      try { await _pool.end(); } catch {}
      _db = null;
      _pool = null;
    }
  }

  const now = Date.now();
  const backoff = Math.min(RETRY_INTERVAL_MS * Math.pow(1.5, _retryCount), MAX_RETRY_BACKOFF_MS);
  if (now - _lastConnectAttempt < backoff) {
    return null;
  }
  _lastConnectAttempt = now;

  if (!PG_DATABASE_URL) return null;

  try {
    _pool = createPool();
    if (!_pool) {
      _retryCount++;
      return null;
    }
    await Promise.race([
      _pool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("connect timeout")), 10000)),
    ]);
    _db = drizzle({ client: _pool });
    _retryCount = 0;
    console.log("[Database] Connected successfully");
    return _db;
  } catch (error: any) {
    console.warn(`[Database] Connection attempt failed (retry #${_retryCount + 1}):`, error?.message || error);
    try { await _pool?.end(); } catch {}
    _db = null;
    _pool = null;
    _retryCount++;
    return null;
  }
}

export function resetDbPool() {
  try { _pool?.end(); } catch {}
  _db = null;
  _pool = null;
  _retryCount = 0;
  _lastConnectAttempt = 0;
  console.log("[Database] Pool reset, will reconnect on next query");
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
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
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
  const [row] = await db.insert(employees).values(data).returning({ id: employees.id });
  return row.id;
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
  const [row] = await db.insert(jobs).values(data).returning({ id: jobs.id });
  return row.id;
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
  if (assignments.length === 0) {
    return db.select().from(jobs).where(eq(jobs.status, "active")).orderBy(jobs.name);
  }
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
  const emp = await db.select({ id: employees.id }).from(employees)
    .where(eq(employees.id, data.employeeId)).limit(1);
  if (emp.length === 0) {
    console.warn(`[clockIn] Rejected ghost employeeId=${data.employeeId}`);
    throw new Error(`Employee ID ${data.employeeId} does not exist`);
  }
  const clockInTime = data.clockIn instanceof Date ? data.clockIn : new Date(data.clockIn as any);
  const fiveMinBefore = new Date(clockInTime.getTime() - 5 * 60000);
  const fiveMinAfter = new Date(clockInTime.getTime() + 5 * 60000);
  const dupe = await db.select({ id: clockEntries.id }).from(clockEntries)
    .where(and(
      eq(clockEntries.employeeId, data.employeeId),
      eq(clockEntries.jobId, data.jobId),
      gte(clockEntries.clockIn, fiveMinBefore),
      lte(clockEntries.clockIn, fiveMinAfter)
    )).limit(1);
  if (dupe.length > 0) {
    console.warn(`[clockIn] Rejected duplicate: emp=${data.employeeId} job=${data.jobId}`);
    return dupe[0].id;
  }
  const [row] = await db.insert(clockEntries).values(data).returning({ id: clockEntries.id });
  return row.id;
}

export async function clockOut(entryId: number, clockOutTime: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clockEntries).set({ clockOut: clockOutTime }).where(eq(clockEntries.id, entryId));
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
  const rows = await db
    .select({
      id: clockEntries.id,
      employeeId: clockEntries.employeeId,
      jobId: clockEntries.jobId,
      clockIn: clockEntries.clockIn,
      clockOut: clockEntries.clockOut,
      isOfflineEntry: clockEntries.isOfflineEntry,
      localId: clockEntries.localId,
      notes: clockEntries.notes,
      employeeName: employees.name,
      employeeRole: employees.role,
      jobName: jobs.name,
    })
    .from(clockEntries)
    .leftJoin(employees, eq(clockEntries.employeeId, employees.id))
    .leftJoin(jobs, eq(clockEntries.jobId, jobs.id))
    .where(isNull(clockEntries.clockOut));
  return rows.map(row => ({
    ...row,
    employeeName: row.employeeName || `Employee #${row.employeeId}`,
    employeeRole: row.employeeRole || "laborer",
    jobName: row.jobName || `Job #${row.jobId}`,
  }));
}

export async function updateClockEntry(entryId: number, data: { clockIn?: Date; clockOut?: Date; jobId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = {};
  if (data.clockIn) updateData.clockIn = data.clockIn;
  if (data.clockOut) updateData.clockOut = data.clockOut;
  if (data.jobId !== undefined) updateData.jobId = data.jobId;
  if (Object.keys(updateData).length === 0) return;
  await db.update(clockEntries).set(updateData).where(eq(clockEntries.id, entryId));
}

// Daily Reports
export async function createDailyReport(data: InsertDailyReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(dailyReports).values(data).returning({ id: dailyReports.id });
  return row.id;
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

export async function markReportSeen(reportId: number, seen: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dailyReports).set({
    seenByOwner: seen,
    seenAt: seen ? new Date() : null,
  }).where(eq(dailyReports.id, reportId));
  return { success: true };
}

// Material Entries
export async function addMaterialEntry(data: InsertMaterialEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(materialEntries).values(data).returning({ id: materialEntries.id });
  return row.id;
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
  const [row] = await db.insert(reportPhotos).values(data).returning({ id: reportPhotos.id });
  return row.id;
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
  const [row] = await db.insert(budgetCategories).values(data).returning({ id: budgetCategories.id });
  return row.id;
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
  const [row] = await db.insert(expenses).values(data).returning({ id: expenses.id });
  return row.id;
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
  const [row] = await db.insert(qbSyncLog).values(data).returning({ id: qbSyncLog.id });
  return row.id;
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
  const [row] = await db.insert(meetings).values(data).returning({ id: meetings.id });
  return row.id as number;
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
  const [row] = await db.insert(weeklyGoals).values(data).returning({ id: weeklyGoals.id });
  return row.id as number;
}

export async function getWeeklyGoals(weekOf?: Date) {
  const db = await getDb();
  if (!db) return [];
  if (weekOf) {
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

export async function getAllClockEntries() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clockEntries);
}

export async function getAllExpenses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(expenses);
}

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
  const [row] = await db.insert(qbEstimates).values(data).returning();
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
  const [row] = await db.insert(kpiMetrics).values(data).returning();
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
    const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
    totalMinutes += mins;
    const emp = empMap.get(entry.employeeId);
    if (emp?.hourlyRate) {
      totalCost += (mins / 60) * parseFloat(emp.hourlyRate);
    }
  }
  return { totalMinutes, totalCost: Math.round(totalCost * 100) / 100 };
}

// ─── Labor Cost Dashboard Queries ────────────────────────────────────────────

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
    const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
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

export async function getWeeklyLaborCostTrend(weeks: number = 8) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
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

    const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
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
    const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
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
    if (budget <= 0) continue;

    const jobEntries = allClockEntries.filter(e => e.jobId === job.id && e.clockOut);
    let laborCost = 0;
    for (const entry of jobEntries) {
      const mins = Math.max(0, Math.floor((new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime()) / 60000));
      const emp = empMap.get(entry.employeeId);
      if (emp?.hourlyRate) {
        laborCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
      }
    }

    const taxRate = parseFloat((job.taxRate as string) || "0");
    const workersCompRate = parseFloat((job.workersCompRate as string) || "0");
    const liabilityInsRate = parseFloat((job.liabilityInsRate as string) || "0");
    const overheadCost = laborCost * ((taxRate + workersCompRate + liabilityInsRate) / 100);

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
  const [row] = await db.insert(safetyTopics).values({
    title: data.title,
    content: data.content || null,
    category: data.category || "general",
    createdBy: data.createdBy,
  }).returning({ id: safetyTopics.id });
  return row.id;
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
  const [row] = await db.insert(safetyMeetings).values({
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
  }).returning({ id: safetyMeetings.id });
  return row.id;
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

// ─── Time Adjustments ────────────────────────────────────────────────────────

export async function createTimeAdjustment(data: InsertTimeAdjustment) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.insert(timeAdjustments).values(data);
}

export async function getAdjustmentsForEntry(clockEntryId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn.select().from(timeAdjustments)
    .where(eq(timeAdjustments.clockEntryId, clockEntryId))
    .orderBy(desc(timeAdjustments.createdAt));
}

export async function getAdjustmentsForEmployee(employeeId: number, startDate: Date, endDate: Date) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const entries = await dbConn.select().from(clockEntries)
    .where(and(
      eq(clockEntries.employeeId, employeeId),
      gte(clockEntries.clockIn, startDate),
      lte(clockEntries.clockIn, endDate)
    ));
  if (entries.length === 0) return [];
  const entryIds = entries.map(e => e.id);
  return dbConn.select().from(timeAdjustments)
    .where(or(...entryIds.map(id => eq(timeAdjustments.clockEntryId, id))))
    .orderBy(desc(timeAdjustments.createdAt));
}

export async function updateClockEntryWithAdjustment(
  entryId: number,
  data: { clockIn?: Date; clockOut?: Date; jobId?: number },
  adjustedBy: number,
  reason: string
) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  const [current] = await dbConn.select().from(clockEntries).where(eq(clockEntries.id, entryId)).limit(1);
  if (!current) throw new Error("Clock entry not found");

  const adjustments: InsertTimeAdjustment[] = [];

  if (data.clockIn && data.clockIn.getTime() !== new Date(current.clockIn).getTime()) {
    adjustments.push({
      clockEntryId: entryId,
      adjustedBy,
      fieldChanged: "clockIn",
      oldValue: current.clockIn.toISOString(),
      newValue: data.clockIn.toISOString(),
      reason,
    });
  }

  if (data.clockOut !== undefined) {
    const oldOut = current.clockOut ? current.clockOut.toISOString() : null;
    const newOut = data.clockOut ? data.clockOut.toISOString() : null;
    if (oldOut !== newOut) {
      adjustments.push({
        clockEntryId: entryId,
        adjustedBy,
        fieldChanged: "clockOut",
        oldValue: oldOut,
        newValue: newOut,
        reason,
      });
    }
  }

  if (data.jobId !== undefined && data.jobId !== current.jobId) {
    adjustments.push({
      clockEntryId: entryId,
      adjustedBy,
      fieldChanged: "jobId",
      oldValue: String(current.jobId),
      newValue: String(data.jobId),
      reason,
    });
  }

  const updateData: any = {};
  if (data.clockIn) updateData.clockIn = data.clockIn;
  if (data.clockOut) updateData.clockOut = data.clockOut;
  if (data.jobId !== undefined) updateData.jobId = data.jobId;
  if (Object.keys(updateData).length > 0) {
    await dbConn.update(clockEntries).set(updateData).where(eq(clockEntries.id, entryId));
  }

  for (const adj of adjustments) {
    await dbConn.insert(timeAdjustments).values(adj);
  }

  return { updated: true, adjustmentsLogged: adjustments.length };
}

export async function getDetailedTimecard(employeeId: number, startDate: Date, endDate: Date) {
  const dbConn = await getDb();
  if (!dbConn) return { days: [], totalMinutes: 0, employee: null };

  const emp = await getEmployeeById(employeeId);
  const entries = await dbConn.select().from(clockEntries)
    .where(and(
      eq(clockEntries.employeeId, employeeId),
      gte(clockEntries.clockIn, startDate),
      lte(clockEntries.clockIn, endDate)
    ))
    .orderBy(clockEntries.clockIn);

  const allJobs = await dbConn.select().from(jobs);
  const jobMap = new Map(allJobs.map(j => [j.id, j]));

  const entryIds = entries.map(e => e.id);
  let adjustmentMap = new Map<number, any[]>();
  if (entryIds.length > 0) {
    const allAdj = await dbConn.select().from(timeAdjustments)
      .where(or(...entryIds.map(id => eq(timeAdjustments.clockEntryId, id))))
      .orderBy(desc(timeAdjustments.createdAt));
    const allEmps = await dbConn.select().from(employees);
    const empMap = new Map(allEmps.map(e => [e.id, e]));
    for (const adj of allAdj) {
      const list = adjustmentMap.get(adj.clockEntryId) || [];
      list.push({
        ...adj,
        adjustedByName: empMap.get(adj.adjustedBy)?.name || "Unknown",
      });
      adjustmentMap.set(adj.clockEntryId, list);
    }
  }

  const dayMap = new Map<string, any[]>();
  let totalMinutes = 0;
  for (const entry of entries) {
    const dayKey = new Date(entry.clockIn).toISOString().slice(0, 10);
    const list = dayMap.get(dayKey) || [];
    const durationMs = entry.clockOut
      ? new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()
      : 0;
    const minutes = Math.max(0, Math.floor(durationMs / 60000));
    totalMinutes += minutes;
    const job = jobMap.get(entry.jobId);
    list.push({
      ...entry,
      jobName: job?.name || "Unknown Job",
      durationMinutes: minutes,
      adjustments: adjustmentMap.get(entry.id) || [],
    });
    dayMap.set(dayKey, list);
  }

  const days = Array.from(dayMap.entries()).map(([date, dayEntries]) => ({
    date,
    entries: dayEntries,
    totalMinutes: dayEntries.reduce((sum: number, e: any) => sum + e.durationMinutes, 0),
  })).sort((a, b) => b.date.localeCompare(a.date));

  return { days, totalMinutes, employee: emp };
}


// ─── Punch List Items ────────────────────────────────────────────────────────

export async function getPunchListItems(jobId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn.select().from(punchListItems)
    .where(eq(punchListItems.jobId, jobId))
    .orderBy(punchListItems.area, punchListItems.sortOrder, punchListItems.createdAt);
}

export async function getAllPunchListItems() {
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn.select().from(punchListItems)
    .orderBy(desc(punchListItems.createdAt));
}

export async function createPunchListItem(data: {
  jobId: number;
  area?: string;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  assignedTo?: number;
  createdBy: number;
  sortOrder?: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const [row] = await dbConn.insert(punchListItems).values({
    jobId: data.jobId,
    area: data.area || null,
    title: data.title,
    description: data.description || null,
    priority: data.priority || "medium",
    assignedTo: data.assignedTo || null,
    createdBy: data.createdBy,
    sortOrder: data.sortOrder || 0,
  }).returning({ id: punchListItems.id });
  return row.id;
}

export async function createPunchListItemsBulk(items: Array<{
  jobId: number;
  area?: string;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  assignedTo?: number;
  createdBy: number;
  sortOrder?: number;
}>) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  if (items.length === 0) return [];
  const values = items.map((item, idx) => ({
    jobId: item.jobId,
    area: item.area || null,
    title: item.title,
    description: item.description || null,
    priority: item.priority || "medium",
    assignedTo: item.assignedTo || null,
    createdBy: item.createdBy,
    sortOrder: item.sortOrder ?? idx,
  }));
  await dbConn.insert(punchListItems).values(values);
  return values.length;
}

export async function updatePunchListItem(id: number, data: {
  title?: string;
  description?: string;
  area?: string;
  status?: "pending" | "completed";
  priority?: "low" | "medium" | "high";
  assignedTo?: number | null;
  completedBy?: number | null;
  completedAt?: Date | null;
  sortOrder?: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.update(punchListItems).set(data as any).where(eq(punchListItems.id, id));
}

export async function togglePunchListItem(id: number, completedBy: number) {
  const dbConn = await getDb();
  if (!dbConn) return;
  const [item] = await dbConn.select().from(punchListItems).where(eq(punchListItems.id, id)).limit(1);
  if (!item) return;
  if (item.status === "completed") {
    await dbConn.update(punchListItems).set({
      status: "pending",
      completedBy: null,
      completedAt: null,
    }).where(eq(punchListItems.id, id));
  } else {
    await dbConn.update(punchListItems).set({
      status: "completed",
      completedBy,
      completedAt: new Date(),
    }).where(eq(punchListItems.id, id));
  }
}

export async function deletePunchListItem(id: number) {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.delete(punchListItems).where(eq(punchListItems.id, id));
}


// ── Manual Clock Entry Management ──────────────────────────────────────
export async function addManualClockEntry(input: {
  employeeId: number;
  jobId: number;
  clockIn: Date;
  clockOut: Date;
  addedBy: number;
  reason: string;
}) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [entry] = await dbConn.insert(clockEntries).values({
    employeeId: input.employeeId,
    jobId: input.jobId,
    clockIn: input.clockIn,
    clockOut: input.clockOut,
    isOfflineEntry: false,
  }).returning({ id: clockEntries.id });
  await dbConn.insert(timeAdjustments).values({
    clockEntryId: entry.id,
    adjustedBy: input.addedBy,
    fieldChanged: "manual_add",
    oldValue: null,
    newValue: `${input.clockIn.toISOString()} - ${input.clockOut.toISOString()}`,
    reason: `Manual entry added: ${input.reason}`,
  });
  return entry;
}

export async function deleteClockEntry(entryId: number, deletedBy: number, reason: string) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [existing] = await dbConn.select().from(clockEntries).where(eq(clockEntries.id, entryId));
  if (existing) {
    await dbConn.insert(timeAdjustments).values({
      clockEntryId: entryId,
      adjustedBy: deletedBy,
      fieldChanged: "delete",
      oldValue: `${existing.clockIn} - ${existing.clockOut}`,
      newValue: null,
      reason: `Entry deleted: ${reason}`,
    });
  }
  await dbConn.delete(clockEntries).where(eq(clockEntries.id, entryId));
  return { success: true };
}

// ─── Messages / Notes ──────────────────────────────────────────────────────

export async function sendMessage(data: {
  senderId: number;
  subject: string;
  body: string;
  type?: "note" | "message" | "alert" | "plan_set";
  priority?: "normal" | "urgent";
  attachmentUrl?: string;
  attachmentType?: "image" | "pdf" | "document";
  attachmentName?: string;
  isCompanyWide?: boolean;
  recipientIds?: number[];
}) {
  const dbConn = await getDb();
  if (!dbConn) return null;

  const [msg] = await dbConn.insert(messages).values({
    senderId: data.senderId,
    subject: data.subject,
    body: data.body,
    type: data.type || "message",
    priority: data.priority || "normal",
    attachmentUrl: data.attachmentUrl || null,
    attachmentType: data.attachmentType || null,
    attachmentName: data.attachmentName || null,
    isCompanyWide: data.isCompanyWide || false,
  }).returning({ id: messages.id });

  const messageId = msg.id;

  if (data.isCompanyWide) {
    const allEmployees = await dbConn.select({ id: employees.id }).from(employees).where(eq(employees.isActive, true));
    if (allEmployees.length > 0) {
      const recipients = allEmployees.filter(e => e.id !== data.senderId);
      if (recipients.length > 0) {
        await dbConn.insert(messageRecipients).values(
          recipients.map(e => ({
            messageId,
            recipientId: e.id,
          }))
        );
      }
    }
  } else if (data.recipientIds && data.recipientIds.length > 0) {
    await dbConn.insert(messageRecipients).values(
      data.recipientIds.map(rid => ({
        messageId,
        recipientId: rid,
      }))
    );
  }

  return { id: messageId, success: true };
}

export async function getInboxMessages(employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];

  const rows = await dbConn
    .select({
      id: messages.id,
      senderId: messages.senderId,
      subject: messages.subject,
      body: messages.body,
      type: messages.type,
      priority: messages.priority,
      attachmentUrl: messages.attachmentUrl,
      attachmentType: messages.attachmentType,
      attachmentName: messages.attachmentName,
      isCompanyWide: messages.isCompanyWide,
      createdAt: messages.createdAt,
      isRead: messageRecipients.isRead,
      readAt: messageRecipients.readAt,
      recipientId: messageRecipients.recipientId,
    })
    .from(messageRecipients)
    .innerJoin(messages, eq(messageRecipients.messageId, messages.id))
    .where(eq(messageRecipients.recipientId, employeeId))
    .orderBy(desc(messages.createdAt));

  return rows;
}

export async function getSentMessages(employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];

  const rows = await dbConn
    .select()
    .from(messages)
    .where(eq(messages.senderId, employeeId))
    .orderBy(desc(messages.createdAt));

  return rows;
}

export async function markMessageRead(messageId: number, employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;

  await dbConn
    .update(messageRecipients)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(messageRecipients.messageId, messageId),
        eq(messageRecipients.recipientId, employeeId)
      )
    );

  return { success: true };
}

export async function getUnreadCount(employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return 0;

  const rows = await dbConn
    .select({ id: messageRecipients.id })
    .from(messageRecipients)
    .where(
      and(
        eq(messageRecipients.recipientId, employeeId),
        eq(messageRecipients.isRead, false)
      )
    );

  return rows.length;
}

export async function getMessageRecipients(messageId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];

  const rows = await dbConn
    .select({
      recipientId: messageRecipients.recipientId,
      isRead: messageRecipients.isRead,
      readAt: messageRecipients.readAt,
      employeeName: employees.name,
      employeeRole: employees.role,
    })
    .from(messageRecipients)
    .innerJoin(employees, eq(messageRecipients.recipientId, employees.id))
    .where(eq(messageRecipients.messageId, messageId));

  return rows;
}


// ─── Change Orders ──────────────────────────────────────────────────────────

export async function getChangeOrdersForJob(jobId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn
    .select()
    .from(changeOrders)
    .where(eq(changeOrders.jobId, jobId))
    .orderBy(desc(changeOrders.orderDate));
}

export async function createChangeOrder(data: {
  jobId: number;
  description: string;
  amount: string;
  orderType: "add" | "deduct";
  status?: "pending" | "approved" | "rejected";
  createdBy: number;
  notes?: string;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const [row] = await dbConn.insert(changeOrders).values({
    jobId: data.jobId,
    description: data.description,
    amount: data.amount,
    orderType: data.orderType,
    status: data.status || "approved",
    createdBy: data.createdBy,
    notes: data.notes || null,
    orderDate: new Date(),
  }).returning({ id: changeOrders.id });
  return { id: row.id };
}

export async function updateChangeOrderStatus(id: number, status: "pending" | "approved" | "rejected", approvedBy?: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn
    .update(changeOrders)
    .set({ status, approvedBy: approvedBy || null })
    .where(eq(changeOrders.id, id));
}

export async function deleteChangeOrder(id: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.delete(changeOrders).where(eq(changeOrders.id, id));
}

export async function getChangeOrderTotal(jobId: number) {
  const dbConn = await getDb();
  if (!dbConn) return 0;
  const orders = await dbConn
    .select()
    .from(changeOrders)
    .where(and(eq(changeOrders.jobId, jobId), eq(changeOrders.status, "approved")));
  let total = 0;
  for (const o of orders) {
    const amt = parseFloat(String(o.amount) || "0");
    total += o.orderType === "deduct" ? -amt : amt;
  }
  return total;
}


// ─── Financial Charts Analytics ──────────────────────────────────────────────

export async function getJobProfitability() {
  const db = await getDb();
  if (!db) return [];

  const allJobs = await db.select().from(jobs);
  const allEntries = await db.select().from(clockEntries);
  const allEmployees = await db.select().from(employees);
  const allExpenses = await db.select().from(expenses);
  const allChangeOrders = await db.select().from(changeOrders);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  return allJobs.filter(j => j.status === "active" || j.status === "completed").map(job => {
    const baseBudget = parseFloat((job.totalBudget as string) || "0");

    const jobCOs = allChangeOrders.filter(co => co.jobId === job.id && co.status === "approved");
    let coTotal = 0;
    for (const co of jobCOs) {
      const amt = parseFloat(String(co.amount) || "0");
      coTotal += co.orderType === "deduct" ? -amt : amt;
    }
    const effectiveBudget = baseBudget + coTotal;

    const jobEntries = allEntries.filter(e => e.jobId === job.id && e.clockOut);
    let laborCost = 0;
    let totalMinutes = 0;
    for (const entry of jobEntries) {
      const mins = Math.max(0, Math.floor((new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime()) / 60000));
      totalMinutes += mins;
      const emp = empMap.get(entry.employeeId);
      if (emp?.hourlyRate) {
        laborCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
      }
    }

    const taxRate = parseFloat((job.taxRate as string) || "0");
    const wcRate = parseFloat((job.workersCompRate as string) || "0");
    const liRate = parseFloat((job.liabilityInsRate as string) || "0");
    const taxCost = laborCost * (taxRate / 100);
    const wcCost = laborCost * (wcRate / 100);
    const liCost = laborCost * (liRate / 100);
    const overheadCost = taxCost + wcCost + liCost;

    const jobExp = allExpenses.filter(e => e.jobId === job.id);
    const expenseCost = jobExp.reduce((s, e) => s + parseFloat((e.amount as string) || "0"), 0);

    const totalSpend = laborCost + overheadCost + expenseCost;
    const profit = effectiveBudget - totalSpend;
    const marginPct = effectiveBudget > 0 ? (profit / effectiveBudget) * 100 : 0;

    return {
      jobId: job.id,
      jobName: job.name,
      status: job.status,
      baseBudget: Math.round(baseBudget * 100) / 100,
      changeOrderTotal: Math.round(coTotal * 100) / 100,
      effectiveBudget: Math.round(effectiveBudget * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      taxCost: Math.round(taxCost * 100) / 100,
      wcCost: Math.round(wcCost * 100) / 100,
      liCost: Math.round(liCost * 100) / 100,
      overheadCost: Math.round(overheadCost * 100) / 100,
      expenseCost: Math.round(expenseCost * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      marginPct: Math.round(marginPct * 10) / 10,
      totalMinutes,
      changeOrderCount: jobCOs.length,
    };
  }).sort((a, b) => b.effectiveBudget - a.effectiveBudget);
}

export async function getTaxBreakdown() {
  const db = await getDb();
  if (!db) return [];

  const allJobs = await db.select().from(jobs).where(eq(jobs.status, "active"));
  const allEntries = await db.select().from(clockEntries);
  const allEmployees = await db.select().from(employees);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  return allJobs.map(job => {
    const jobEntries = allEntries.filter(e => e.jobId === job.id && e.clockOut);
    let laborCost = 0;
    for (const entry of jobEntries) {
      const mins = Math.max(0, Math.floor((new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime()) / 60000));
      const emp = empMap.get(entry.employeeId);
      if (emp?.hourlyRate) {
        laborCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
      }
    }

    const taxRate = parseFloat((job.taxRate as string) || "0");
    const wcRate = parseFloat((job.workersCompRate as string) || "0");
    const liRate = parseFloat((job.liabilityInsRate as string) || "0");

    return {
      jobId: job.id,
      jobName: job.name,
      laborCost: Math.round(laborCost * 100) / 100,
      taxRate,
      taxCost: Math.round(laborCost * (taxRate / 100) * 100) / 100,
      workersCompRate: wcRate,
      workersCompCost: Math.round(laborCost * (wcRate / 100) * 100) / 100,
      liabilityInsRate: liRate,
      liabilityInsCost: Math.round(laborCost * (liRate / 100) * 100) / 100,
      totalOverhead: Math.round(laborCost * ((taxRate + wcRate + liRate) / 100) * 100) / 100,
    };
  }).filter(j => j.laborCost > 0).sort((a, b) => b.totalOverhead - a.totalOverhead);
}

export async function getBudgetBurnDown(jobId: number, weeks: number = 12) {
  const db = await getDb();
  if (!db) return { job: null, burnDown: [] };

  const job = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job.length) return { job: null, burnDown: [] };
  const theJob = job[0];

  const baseBudget = parseFloat((theJob.totalBudget as string) || "0");
  const jobCOs = await db.select().from(changeOrders).where(and(eq(changeOrders.jobId, jobId), eq(changeOrders.status, "approved")));
  let coTotal = 0;
  for (const co of jobCOs) {
    const amt = parseFloat(String(co.amount) || "0");
    coTotal += co.orderType === "deduct" ? -amt : amt;
  }
  const effectiveBudget = baseBudget + coTotal;

  const jobEntries = await db.select().from(clockEntries).where(eq(clockEntries.jobId, jobId));
  const allEmployees = await db.select().from(employees);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  const jobExpenses = await db.select().from(expenses).where(eq(expenses.jobId, jobId));

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() + mondayOffset);
  currentMonday.setHours(0, 0, 0, 0);

  const startDate = new Date(currentMonday);
  startDate.setDate(startDate.getDate() - (weeks - 1) * 7);

  const burnDown: { weekLabel: string; weekStart: string; cumulativeSpend: number; budgetLine: number }[] = [];
  let cumulativeSpend = 0;

  for (const entry of jobEntries) {
    if (!entry.clockOut) continue;
    const clockInDate = new Date(entry.clockIn);
    if (clockInDate >= startDate) continue;
    const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
    const emp = empMap.get(entry.employeeId);
    if (emp?.hourlyRate) {
      const cost = (mins / 60) * parseFloat(emp.hourlyRate as string);
      const taxRate = parseFloat((theJob.taxRate as string) || "0");
      const wcRate = parseFloat((theJob.workersCompRate as string) || "0");
      const liRate = parseFloat((theJob.liabilityInsRate as string) || "0");
      cumulativeSpend += cost * (1 + (taxRate + wcRate + liRate) / 100);
    }
  }
  for (const exp of jobExpenses) {
    const expDate = new Date(exp.expenseDate);
    if (expDate >= startDate) continue;
    cumulativeSpend += parseFloat((exp.amount as string) || "0");
  }

  for (let i = 0; i < weeks; i++) {
    const ws = new Date(startDate);
    ws.setDate(ws.getDate() + i * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);

    let weekLabor = 0;
    for (const entry of jobEntries) {
      if (!entry.clockOut) continue;
      const clockInDate = new Date(entry.clockIn);
      if (clockInDate < ws || clockInDate >= we) continue;
      const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
      const emp = empMap.get(entry.employeeId);
      if (emp?.hourlyRate) {
        weekLabor += (mins / 60) * parseFloat(emp.hourlyRate as string);
      }
    }
    const taxRate = parseFloat((theJob.taxRate as string) || "0");
    const wcRate = parseFloat((theJob.workersCompRate as string) || "0");
    const liRate = parseFloat((theJob.liabilityInsRate as string) || "0");
    weekLabor *= (1 + (taxRate + wcRate + liRate) / 100);

    let weekExpenses = 0;
    for (const exp of jobExpenses) {
      const expDate = new Date(exp.expenseDate);
      if (expDate < ws || expDate >= we) continue;
      weekExpenses += parseFloat((exp.amount as string) || "0");
    }

    cumulativeSpend += weekLabor + weekExpenses;

    const month = ws.toLocaleString("en-US", { month: "short" });
    const day = ws.getDate();
    burnDown.push({
      weekLabel: `${month} ${day}`,
      weekStart: ws.toISOString(),
      cumulativeSpend: Math.round(cumulativeSpend * 100) / 100,
      budgetLine: effectiveBudget,
    });
  }

  return {
    job: {
      id: theJob.id,
      name: theJob.name,
      effectiveBudget,
      baseBudget,
      changeOrderTotal: coTotal,
    },
    burnDown,
  };
}

export async function getMonthlyLaborTrend(months: number = 6) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const entries = await db.select().from(clockEntries).where(gte(clockEntries.clockIn, startDate));
  const allEmployees = await db.select().from(employees);
  const allJobs = await db.select().from(jobs);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  const monthBuckets: { monthLabel: string; totalMinutes: number; laborOnly: number; taxCost: number; wcCost: number; liCost: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    monthBuckets.push({
      monthLabel: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      totalMinutes: 0,
      laborOnly: 0,
      taxCost: 0,
      wcCost: 0,
      liCost: 0,
    });
  }

  const activeJobs = allJobs.filter(j => j.status === "active");
  let avgTaxRate = 0, avgWcRate = 0, avgLiRate = 0;
  if (activeJobs.length > 0) {
    avgTaxRate = activeJobs.reduce((s, j) => s + parseFloat((j.taxRate as string) || "0"), 0) / activeJobs.length;
    avgWcRate = activeJobs.reduce((s, j) => s + parseFloat((j.workersCompRate as string) || "0"), 0) / activeJobs.length;
    avgLiRate = activeJobs.reduce((s, j) => s + parseFloat((j.liabilityInsRate as string) || "0"), 0) / activeJobs.length;
  }

  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const clockInDate = new Date(entry.clockIn);
    const monthIdx = (clockInDate.getFullYear() - startDate.getFullYear()) * 12 + (clockInDate.getMonth() - startDate.getMonth());
    if (monthIdx < 0 || monthIdx >= months) continue;

    const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
    monthBuckets[monthIdx].totalMinutes += mins;
    const emp = empMap.get(entry.employeeId);
    if (emp?.hourlyRate) {
      const cost = (mins / 60) * parseFloat(emp.hourlyRate as string);
      monthBuckets[monthIdx].laborOnly += cost;
      monthBuckets[monthIdx].taxCost += cost * (avgTaxRate / 100);
      monthBuckets[monthIdx].wcCost += cost * (avgWcRate / 100);
      monthBuckets[monthIdx].liCost += cost * (avgLiRate / 100);
    }
  }

  return monthBuckets.map(b => ({
    ...b,
    laborOnly: Math.round(b.laborOnly * 100) / 100,
    taxCost: Math.round(b.taxCost * 100) / 100,
    wcCost: Math.round(b.wcCost * 100) / 100,
    liCost: Math.round(b.liCost * 100) / 100,
    totalCost: Math.round((b.laborOnly + b.taxCost + b.wcCost + b.liCost) * 100) / 100,
  }));
}


// ─── Budget Audit Log ─────────────────────────────────────────────────────

export async function createBudgetAuditEntry(entry: InsertBudgetAuditLog) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [row] = await dbConn.insert(budgetAuditLog).values(entry).returning({ id: budgetAuditLog.id });
  return row.id;
}

export async function getBudgetAuditLog(jobId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const rows = await dbConn
    .select()
    .from(budgetAuditLog)
    .where(eq(budgetAuditLog.jobId, jobId))
    .orderBy(desc(budgetAuditLog.createdAt));
  return rows;
}

// ─── Date-Filtered Analytics ──────────────────────────────────────────────

export async function getJobProfitabilityFiltered(startDate?: string, endDate?: string) {
  const dbConn = await getDb();
  if (!dbConn) return [];

  const allJobs = await dbConn.select().from(jobs).where(eq(jobs.status, "active"));
  const allBudgets = await dbConn.select().from(budgetCategories);
  const allChangeOrderRows = await dbConn.select().from(changeOrders);

  let clockConditions: any[] = [];
  if (startDate) clockConditions.push(gte(clockEntries.clockIn, new Date(startDate)));
  if (endDate) clockConditions.push(lte(clockEntries.clockIn, new Date(endDate)));

  const clockRows = clockConditions.length > 0
    ? await dbConn.select().from(clockEntries).where(and(...clockConditions))
    : await dbConn.select().from(clockEntries);

  let expConditions: any[] = [];
  if (startDate) expConditions.push(gte(expenses.expenseDate, new Date(startDate)));
  if (endDate) expConditions.push(lte(expenses.expenseDate, new Date(endDate)));

  const expenseRows = expConditions.length > 0
    ? await dbConn.select().from(expenses).where(and(...expConditions))
    : await dbConn.select().from(expenses);

  return allJobs.map(j => {
    const jobBudgets = allBudgets.filter(b => b.jobId === j.id);
    const baseBudget = jobBudgets.reduce((s, b) => s + Number(b.budgetedAmount || 0), 0);
    const jobCOs = allChangeOrderRows.filter(co => co.jobId === j.id);
    const coTotal = jobCOs.reduce((s, co) => s + Number(co.amount || 0), 0);
    const effectiveBudget = baseBudget + coTotal;

    const jobClock = clockRows.filter(c => c.jobId === j.id && c.clockOut);
    const laborMinutes = jobClock.reduce((s, c) => {
      const diff = new Date(c.clockOut!).getTime() - new Date(c.clockIn).getTime();
      return s + diff / 60000;
    }, 0);
    const laborCost = (laborMinutes / 60) * 35;

    const jobExpenses = expenseRows.filter(e => e.jobId === j.id);
    const materialCost = jobExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    const totalSpend = laborCost + materialCost;
    const profit = effectiveBudget - totalSpend;
    const marginPct = effectiveBudget > 0 ? (profit / effectiveBudget) * 100 : 0;

    return {
      jobId: j.id,
      jobName: j.name,
      effectiveBudget: Math.round(effectiveBudget * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      materialCost: Math.round(materialCost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      marginPct: Math.round(marginPct * 10) / 10,
    };
  });
}

export async function getMonthlyLaborTrendFiltered(startDate?: string, endDate?: string) {
  const dbConn = await getDb();
  if (!dbConn) return [];

  let conditions: any[] = [];
  if (startDate) conditions.push(gte(clockEntries.clockIn, new Date(startDate)));
  if (endDate) conditions.push(lte(clockEntries.clockIn, new Date(endDate)));

  const clockRows = conditions.length > 0
    ? await dbConn.select().from(clockEntries).where(and(...conditions))
    : await dbConn.select().from(clockEntries);

  const allEmployees = await dbConn.select().from(employees);
  const rateMap = new Map(allEmployees.map(e => [e.id, Number(e.hourlyRate || 35)]));

  const monthMap = new Map<string, { totalMinutes: number; laborOnly: number; taxCost: number; wcCost: number; liCost: number }>();

  for (const c of clockRows) {
    if (!c.clockOut) continue;
    const d = new Date(c.clockIn);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) monthMap.set(key, { totalMinutes: 0, laborOnly: 0, taxCost: 0, wcCost: 0, liCost: 0 });
    const bucket = monthMap.get(key)!;
    const mins = (new Date(c.clockOut).getTime() - d.getTime()) / 60000;
    const rate = rateMap.get(c.employeeId) || 35;
    const cost = (mins / 60) * rate;
    bucket.totalMinutes += mins;
    bucket.laborOnly += cost;
    bucket.taxCost += cost * 0.0765;
    bucket.wcCost += cost * 0.08;
    bucket.liCost += cost * 0.02;
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => {
      const [y, m] = key.split("-");
      return {
        monthLabel: `${monthNames[parseInt(m) - 1]} ${y}`,
        totalMinutes: Math.round(b.totalMinutes),
        laborOnly: Math.round(b.laborOnly * 100) / 100,
        taxCost: Math.round(b.taxCost * 100) / 100,
        wcCost: Math.round(b.wcCost * 100) / 100,
        liCost: Math.round(b.liCost * 100) / 100,
        totalCost: Math.round((b.laborOnly + b.taxCost + b.wcCost + b.liCost) * 100) / 100,
      };
    });
}
