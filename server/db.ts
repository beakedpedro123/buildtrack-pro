import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
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
  companyOverhead,
  InsertCompanyOverhead,
  jobSchedule,
  InsertJobSchedule,
  employeeTaxInfo,
  InsertEmployeeTaxInfo,
  companies,
  InsertCompany,
  supportTickets,
  InsertSupportTicket,
  supportTicketReplies,
  InsertSupportTicketReply,
  knowledgeBase,
  InsertKnowledgeBaseArticle,
  pivotSupportLearning,
  InsertPivotSupportLearningEntry,
  tradeKnowledge,
  InsertTradeKnowledge,
  tradeBenchmarks,
  InsertTradeBenchmark,
  securityAuditLog,
  adminIpAllowlist,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { hashPin, verifyPin as verifyPinHash } from "./_core/crypto";
import { encryptSSN, decryptSSN, isEncrypted, getSSNLast4 } from "./_core/crypto";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;
let _lastConnectAttempt = 0;
let _retryCount = 0;
const RETRY_INTERVAL_MS = 3000; // 3 seconds between retries (fast recovery)
const MAX_RETRY_BACKOFF_MS = 15000; // Max 15 seconds between retries
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function createPool() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      timezone: "Z",
      connectTimeout: 30000, // 30s connection timeout (TiDB serverless can be slow to wake)
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000, // Keep TCP alive every 10s
      maxIdle: 10, // Keep all connections in pool
      idleTimeout: 240000, // Close idle connections after 4 min (TiDB drops at 5 min)
    });
    return pool;
  } catch (error) {
    console.warn("[Database] Failed to create pool:", error);
    return null;
  }
}

// Keep-alive: ping DB every 2 minutes to prevent TiDB serverless hibernation
function startKeepAlive() {
  if (_keepAliveTimer) return;
  _keepAliveTimer = setInterval(async () => {
    if (!_pool) return;
    try {
      const promisePool = _pool.promise();
      await Promise.race([
        promisePool.query("SELECT 1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("keepalive timeout")), 10000)),
      ]);
    } catch {
      console.warn("[Database] Keep-alive ping failed, will reconnect on next query");
      try { _pool?.end(); } catch {}
      _db = null;
      _pool = null;
    }
  }, 120000); // Every 2 minutes
}

function stopKeepAlive() {
  if (_keepAliveTimer) {
    clearInterval(_keepAliveTimer);
    _keepAliveTimer = null;
  }
}

export async function getDb() {
  // If we have a DB instance, verify it's still alive
  if (_db && _pool) {
    try {
      // Quick ping to check connection health
      const promisePool = _pool.promise();
      await Promise.race([
        promisePool.query("SELECT 1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 8000)),
      ]);
      _retryCount = 0; // Reset retry count on success
      return _db;
    } catch {
      console.warn("[Database] Connection lost, will recreate pool...");
      stopKeepAlive();
      try { _pool.end(); } catch {}
      _db = null;
      _pool = null;
    }
  }

  // Rate-limit reconnection attempts with exponential backoff
  const now = Date.now();
  const backoff = Math.min(RETRY_INTERVAL_MS * Math.pow(1.5, _retryCount), MAX_RETRY_BACKOFF_MS);
  if (now - _lastConnectAttempt < backoff) {
    return null; // Too soon to retry
  }
  _lastConnectAttempt = now;

  if (!process.env.DATABASE_URL) return null;

  try {
    _pool = createPool();
    if (!_pool) {
      _retryCount++;
      return null;
    }
    // Verify the pool actually works — give TiDB serverless up to 30s to wake
    const promisePool = _pool.promise();
    await Promise.race([
      promisePool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("connect timeout")), 30000)),
    ]);
    _db = drizzle({ client: _pool });
    _retryCount = 0;
    console.log("[Database] Connected successfully");
    startKeepAlive(); // Start keep-alive pings to prevent hibernation
    return _db;
  } catch (error: any) {
    console.warn(`[Database] Connection attempt failed (retry #${_retryCount + 1}):`, error?.message || error);
    try { _pool?.end(); } catch {}
    _db = null;
    _pool = null;
    _retryCount++;
    return null;
  }
}

// Aggressive startup connection: try up to 10 times with 5s delays to wake TiDB
export async function ensureDbConnected(): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    console.log(`[Database] Startup connection attempt ${i + 1}/10...`);
    _retryCount = 0;
    _lastConnectAttempt = 0;
    const db = await getDb();
    if (db) {
      console.log("[Database] Startup connection established!");
      return true;
    }
    // Wait 5 seconds before next attempt
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  console.error("[Database] Failed to connect after 10 startup attempts");
  return false;
}

// Force reset the connection pool (call when you detect persistent errors)
export function resetDbPool() {
  stopKeepAlive();
  try { _pool?.end(); } catch {}
  _db = null;
  _pool = null;
  _retryCount = 0;
  _lastConnectAttempt = 0;
  console.log("[Database] Pool reset, will reconnect on next query");
}

// ─── Companies (Multi-Tenant) ─────────────────────────────────────────────

export async function createCompany(data: Omit<InsertCompany, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Set trial end date to 14 days from now
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const result = await db.insert(companies).values({
    ...data,
    trialEndDate: data.trialEndDate || trialEnd,
  });
  return result[0].insertId;
}

export async function getCompanyById(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  return rows[0] || null;
}

export async function getCompanyBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(companies).where(eq(companies.slug, slug)).limit(1);
  return rows[0] || null;
}

export async function updateCompany(companyId: number, data: Partial<InsertCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(companies).set(data).where(eq(companies.id, companyId));
}

export async function getAllCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).orderBy(desc(companies.createdAt));
}

export async function getCompanyByStripeCustomerId(stripeCustomerId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(companies).where(eq(companies.stripeCustomerId, stripeCustomerId)).limit(1);
  return rows[0] || null;
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
export async function getAllEmployees(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(employees).where(and(eq(employees.isActive, true), eq(employees.companyId, cid))).orderBy(employees.name);
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0];
}

export async function getEmployeeByPin(pin: string, companyId?: number) {
  // SECURITY FIX (Low #16): PIN verification with bcrypt hash comparison
  const db = await getDb();
  if (!db) return undefined;
  // We can't do bcrypt comparison in SQL, so fetch all active employees for the company
  // and compare in application code. This is safe because:
  // 1. Rate limiting prevents brute force (5 attempts per 15 min)
  // 2. Company scope limits the search space
  const conditions: any[] = [eq(employees.isActive, true)];
  if (companyId) conditions.push(eq(employees.companyId, companyId));
  const candidates = await db.select().from(employees)
    .where(and(...conditions));
  // Try bcrypt comparison first, then fall back to plaintext for unmigrated PINs
  for (const emp of candidates) {
    const match = await verifyPinHash(pin, emp.pin);
    if (match) return emp;
  }
  return undefined;
}

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // SECURITY FIX (Low #16): Hash PIN before storing
  if (data.pin) {
    data = { ...data, pin: await hashPin(data.pin) };
  }
  const result = await db.insert(employees).values(data);
  return result[0].insertId;
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // SECURITY FIX (Low #16): Hash PIN if being updated
  if (data.pin) {
    data = { ...data, pin: await hashPin(data.pin) };
  }
  await db.update(employees).set(data).where(eq(employees.id, id));
}

export async function deactivateEmployee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ isActive: false }).where(eq(employees.id, id));
}

// Jobs
export async function getAllJobs(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(jobs).where(eq(jobs.companyId, cid)).orderBy(desc(jobs.createdAt));
}

export async function getActiveJobs(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(jobs).where(and(eq(jobs.status, "active"), eq(jobs.companyId, cid))).orderBy(jobs.name);
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
  if (assignments.length === 0) {
    // No explicit assignments — return ALL active jobs as fallback
    // This ensures foremen and laborers can always clock in
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
  // 1. Dedup by localId (offline sync)
  if (data.localId) {
    const existing = await db.select().from(clockEntries)
      .where(eq(clockEntries.localId, data.localId)).limit(1);
    if (existing.length > 0) return existing[0].id;
  }
  // 2. Validate employeeId exists (prevent ghost entries)
  const emp = await db.select({ id: employees.id }).from(employees)
    .where(eq(employees.id, data.employeeId)).limit(1);
  if (emp.length === 0) {
    console.warn(`[clockIn] Rejected ghost employeeId=${data.employeeId} — not in employees table`);
    throw new Error(`Employee ID ${data.employeeId} does not exist`);
  }
  // 3. Dedup by time proximity — reject if same employee+job within 5 minutes AND still active (no clockOut)
  const clockInTime = data.clockIn instanceof Date ? data.clockIn : new Date(data.clockIn as any);
  const fiveMinBefore = new Date(clockInTime.getTime() - 5 * 60000);
  const fiveMinAfter = new Date(clockInTime.getTime() + 5 * 60000);
  const dupe = await db.select({ id: clockEntries.id }).from(clockEntries)
    .where(and(
      eq(clockEntries.employeeId, data.employeeId),
      eq(clockEntries.jobId, data.jobId),
      isNull(clockEntries.clockOut), // Only dedup against ACTIVE entries — not already clocked-out ones
      gte(clockEntries.clockIn, fiveMinBefore),
      lte(clockEntries.clockIn, fiveMinAfter)
    )).limit(1);
  if (dupe.length > 0) {
    console.warn(`[clockIn] Rejected duplicate: emp=${data.employeeId} job=${data.jobId} within 5min of active entry ${dupe[0].id}`);
    return dupe[0].id; // Return existing entry ID instead of creating duplicate
  }
  const result = await db.insert(clockEntries).values(data);
  return result[0].insertId;
}

export async function clockOut(entryId: number, clockOutTime: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clockEntries).set({
    clockOut: clockOutTime,
  }).where(eq(clockEntries.id, entryId));
}

export async function updateClockEntryGps(entryId: number, gps: { clockOutLatitude?: number; clockOutLongitude?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clockEntries).set(gps).where(eq(clockEntries.id, entryId));
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

export async function getClockedInEmployees(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  // Join with employees and jobs so the client has name/job info without extra queries
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
      clockInLatitude: clockEntries.clockInLatitude,
      clockInLongitude: clockEntries.clockInLongitude,
      lunchMinutes: clockEntries.lunchMinutes,
      lunchStartedAt: clockEntries.lunchStartedAt,
    })
    .from(clockEntries)
    .leftJoin(employees, eq(clockEntries.employeeId, employees.id))
    .leftJoin(jobs, eq(clockEntries.jobId, jobs.id))
    .where(and(isNull(clockEntries.clockOut), eq(clockEntries.companyId, cid)));
  // Ensure no null names — use fallback for deleted/missing employees
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

export async function getRecentReports(limit = 10, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(dailyReports).where(eq(dailyReports.companyId, cid)).orderBy(desc(dailyReports.reportDate)).limit(limit);
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

export async function getUnsyncedExpenses(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(expenses).where(and(eq(expenses.qbSynced, false), eq(expenses.companyId, cid)));
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

export async function getRecentSyncLogs(limit = 10, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(qbSyncLog).where(eq(qbSyncLog.companyId, cid)).orderBy(desc(qbSyncLog.createdAt)).limit(limit);
}
// ─── Meetings ─────────────────────────────────────────────────────────────────
export async function createMeeting(data: Omit<InsertMeeting, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(meetings).values(data);
  return result[0].insertId as number;
}

export async function getMeetings(limit = 20, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(meetings).where(eq(meetings.companyId, cid)).orderBy(desc(meetings.createdAt)).limit(limit);
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

export async function getWeeklyGoals(weekOf?: Date, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  if (weekOf) {
    // Get goals for the week containing weekOf
    const start = new Date(weekOf);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return db.select().from(weeklyGoals)
      .where(and(gte(weeklyGoals.weekOf, start), lt(weeklyGoals.weekOf, end), eq(weeklyGoals.companyId, cid)))
      .orderBy(weeklyGoals.priority, weeklyGoals.createdAt);
  }
  return db.select().from(weeklyGoals).where(eq(weeklyGoals.companyId, cid)).orderBy(desc(weeklyGoals.createdAt)).limit(50);
}

export async function getGoalsForMeeting(meetingId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weeklyGoals).where(eq(weeklyGoals.meetingId, meetingId));
}

export async function getWeeklyGoalById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
  return result[0];
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

export async function getAllClockEntries(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(clockEntries).where(eq(clockEntries.companyId, cid));
}

export async function getAllExpenses(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(expenses).where(eq(expenses.companyId, cid));
}

export async function getClockEntriesForPayroll(startDate: Date, endDate: Date, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(clockEntries)
    .where(and(gte(clockEntries.clockIn, startDate), lte(clockEntries.clockIn, endDate), eq(clockEntries.companyId, cid)))
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
export async function getAllKpis(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(kpiMetrics).where(and(eq(kpiMetrics.isActive, true), eq(kpiMetrics.companyId, cid))).orderBy(kpiMetrics.category, kpiMetrics.name);
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

// ─── Shared lunch deduction helper ───────────────────────────────────────────
/**
 * Calculates net working minutes for a clock entry after subtracting lunch.
 * Uses per-entry lunchMinutes first; falls back to company auto-deduction settings.
 */
function deductLunch(
  rawMinutes: number,
  entryLunchMinutes: number,
  companySettings: { lunchAutoDeduct: boolean; lunchDeductMinutes: number; lunchMinShiftMinutes: number; lunchSkipDays: string | null } | null,
  clockInDate: Date,
): number {
  // Per-entry lunch takes priority (set during voice clock-out or manual entry)
  if (entryLunchMinutes > 0) {
    return Math.max(0, rawMinutes - entryLunchMinutes);
  }
  // Company-level auto-deduction fallback
  if (companySettings?.lunchAutoDeduct && rawMinutes >= companySettings.lunchMinShiftMinutes) {
    const skipDays = companySettings.lunchSkipDays ? companySettings.lunchSkipDays.split(",").map(Number) : [5];
    const dow = clockInDate.getDay();
    if (!skipDays.includes(dow)) {
      return Math.max(0, rawMinutes - companySettings.lunchDeductMinutes);
    }
  }
  return rawMinutes;
}

// ─── Labor Cost for Job ──────────────────────────────────────────────────
export async function getLaborCostForJob(jobId: number) {
  const db = await getDb();
  if (!db) return { totalMinutes: 0, totalCost: 0 };
  const entries = await db.select().from(clockEntries)
    .where(eq(clockEntries.jobId, jobId));
  // Scope employee lookup to the job's company to prevent cross-company data leakage
  const jobCompanyId = entries.length > 0 ? entries[0].companyId : undefined;
  const allEmployees = jobCompanyId
    ? await db.select().from(employees).where(eq(employees.companyId, jobCompanyId))
    : [];
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  // Get company settings for auto-deduction (use first entry's companyId)
  let companySettings: { lunchAutoDeduct: boolean; lunchDeductMinutes: number; lunchMinShiftMinutes: number; lunchSkipDays: string | null } | null = null;
  if (entries.length > 0 && entries[0].companyId) {
    const company = await getCompanyById(entries[0].companyId);
    if (company) {
      companySettings = {
        lunchAutoDeduct: company.lunchAutoDeduct,
        lunchDeductMinutes: company.lunchDeductMinutes,
        lunchMinShiftMinutes: company.lunchMinShiftMinutes,
        lunchSkipDays: company.lunchSkipDays,
      };
    }
  }

  let totalMinutes = 0;
  let totalCost = 0;
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const rawMins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
    const mins = deductLunch(rawMins, entry.lunchMinutes || 0, companySettings, new Date(entry.clockIn));
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
export async function getLaborCostByJob(startDate: Date, endDate: Date, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  const entries = await db.select().from(clockEntries)
    .where(and(gte(clockEntries.clockIn, startDate), lte(clockEntries.clockIn, endDate), eq(clockEntries.companyId, cid)));
  const allEmployees = await db.select().from(employees).where(eq(employees.companyId, cid));
  const allJobs = await db.select().from(jobs).where(eq(jobs.companyId, cid));
  const empMap = new Map(allEmployees.map(e => [e.id, e]));
  const jobMap = new Map(allJobs.map(j => [j.id, j]));

  // Load company lunch settings for deduction
  const company = await getCompanyById(cid);
  const companySettings = company ? {
    lunchAutoDeduct: company.lunchAutoDeduct,
    lunchDeductMinutes: company.lunchDeductMinutes,
    lunchMinShiftMinutes: company.lunchMinShiftMinutes,
    lunchSkipDays: company.lunchSkipDays,
  } : null;

  const jobAgg: Record<number, { jobId: number; jobName: string; totalMinutes: number; totalCost: number; employeeIds: Set<number> }> = {};
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const rawMins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
    const mins = deductLunch(rawMins, entry.lunchMinutes || 0, companySettings, new Date(entry.clockIn));
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
export async function getWeeklyLaborCostTrend(weeks: number = 8, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
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
    .where(and(gte(clockEntries.clockIn, startDate), eq(clockEntries.companyId, cid)));
  const allEmployees = await db.select().from(employees).where(eq(employees.companyId, cid));
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

  // Load company lunch settings for deduction
  const company = await getCompanyById(cid);
  const companyLunch = company ? {
    lunchAutoDeduct: company.lunchAutoDeduct,
    lunchDeductMinutes: company.lunchDeductMinutes,
    lunchMinShiftMinutes: company.lunchMinShiftMinutes,
    lunchSkipDays: company.lunchSkipDays,
  } : null;

  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const clockInDate = new Date(entry.clockIn);
    const diffDays = Math.floor((clockInDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const bucketIdx = Math.floor(diffDays / 7);
    if (bucketIdx < 0 || bucketIdx >= weeks) continue;

    const rawMins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
    const mins = deductLunch(rawMins, entry.lunchMinutes || 0, companyLunch, clockInDate);
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
export async function getLaborCostByEmployee(startDate: Date, endDate: Date, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  const entries = await db.select().from(clockEntries)
    .where(and(gte(clockEntries.clockIn, startDate), lte(clockEntries.clockIn, endDate), eq(clockEntries.companyId, cid)));
  const allEmployees = await db.select().from(employees).where(eq(employees.companyId, cid));
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  // Load company lunch settings for deduction
  const company = await getCompanyById(cid);
  const companyLunch = company ? {
    lunchAutoDeduct: company.lunchAutoDeduct,
    lunchDeductMinutes: company.lunchDeductMinutes,
    lunchMinShiftMinutes: company.lunchMinShiftMinutes,
    lunchSkipDays: company.lunchSkipDays,
  } : null;

  const empAgg: Record<number, { employeeId: number; employeeName: string; role: string; hourlyRate: string | null; totalMinutes: number; totalCost: number }> = {};
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const rawMins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
    const mins = deductLunch(rawMins, entry.lunchMinutes || 0, companyLunch, new Date(entry.clockIn));
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
export async function getBudgetAlerts(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;

  const activeJobsList = await db.select().from(jobs).where(and(eq(jobs.status, "active"), eq(jobs.companyId, cid)));
  const allClockEntries = await db.select().from(clockEntries).where(eq(clockEntries.companyId, cid));
  const allEmployees = await db.select().from(employees).where(eq(employees.companyId, cid));
  const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, cid));
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
      const mins = Math.max(0, Math.round((new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime()) / 60000));
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
export async function getSafetyTopics(activeOnly = true, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  if (activeOnly) {
    return db.select().from(safetyTopics).where(and(eq(safetyTopics.isActive, true), eq(safetyTopics.companyId, cid))).orderBy(desc(safetyTopics.createdAt));
  }
  return db.select().from(safetyTopics).where(eq(safetyTopics.companyId, cid)).orderBy(desc(safetyTopics.createdAt));
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
export async function getSafetyMeetings(limit = 50, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(safetyMeetings).where(eq(safetyMeetings.companyId, cid)).orderBy(desc(safetyMeetings.conductedAt)).limit(limit);
}

export async function getSafetyMeetingsForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(safetyMeetings).where(eq(safetyMeetings.jobId, jobId)).orderBy(desc(safetyMeetings.conductedAt));
}

export async function getSafetyMeetingsForWeek(startDate: Date, endDate: Date, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(safetyMeetings)
    .where(and(gte(safetyMeetings.conductedAt, startDate), lte(safetyMeetings.conductedAt, endDate), eq(safetyMeetings.companyId, cid)))
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
export async function getGoalsForEmployee(employeeId: number, companyId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  if (!companyId) return [] as any;
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
        eq(weeklyGoals.companyId, companyId),
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

export async function getAllCurrentWeekGoals(companyId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  if (!companyId) return [] as any; const cid = companyId;
  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return dbConn.select().from(weeklyGoals)
    .where(and(gte(weeklyGoals.weekOf, weekStart), lt(weeklyGoals.weekOf, weekEnd), eq(weeklyGoals.companyId, cid)))
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

export async function getAllPivotConversations(limit = 200, companyId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return dbConn.select({
    id: pivotConversations.id,
    employeeId: pivotConversations.employeeId,
    role: pivotConversations.role,
    content: pivotConversations.content,
    language: pivotConversations.language,
    createdAt: pivotConversations.createdAt,
  }).from(pivotConversations)
    .where(eq(pivotConversations.companyId, cid))
    .orderBy(desc(pivotConversations.createdAt))
    .limit(limit);
}

export async function savePivotConversation(employeeId: number, role: string, content: string, language = "en", companyId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.insert(pivotConversations).values({
    employeeId,
    role,
    content,
    language,
    ...(companyId !== undefined && companyId !== null ? { companyId } : {}),
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
  // Get all clock entries for this employee in the range, then get adjustments
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

/**
 * Update a clock entry with adjustment tracking.
 * Logs each changed field as a separate adjustment record.
 */
export async function updateClockEntryWithAdjustment(
  entryId: number,
  data: { clockIn?: Date; clockOut?: Date; jobId?: number },
  adjustedBy: number,
  reason: string
) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  // Get the current entry to compare
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

  // Apply the update
  const updateData: any = {};
  if (data.clockIn) updateData.clockIn = data.clockIn;
  if (data.clockOut) updateData.clockOut = data.clockOut;
  if (data.jobId !== undefined) updateData.jobId = data.jobId;
  if (Object.keys(updateData).length > 0) {
    await dbConn.update(clockEntries).set(updateData).where(eq(clockEntries.id, entryId));
  }

  // Log all adjustments
  for (const adj of adjustments) {
    await dbConn.insert(timeAdjustments).values(adj);
  }

  return { updated: true, adjustmentsLogged: adjustments.length };
}

/**
 * Get detailed timecard for an employee: daily breakdown with entries, job names, adjustments.
 */
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

  // Get all adjustments for these entries
  const entryIds = entries.map(e => e.id);
  let adjustmentMap = new Map<number, any[]>();
  if (entryIds.length > 0) {
    const allAdj = await dbConn.select().from(timeAdjustments)
      .where(or(...entryIds.map(id => eq(timeAdjustments.clockEntryId, id))))
      .orderBy(desc(timeAdjustments.createdAt));
    // Get adjuster names — scope to company to prevent cross-company leakage
    const adjusterIds = [...new Set(allAdj.map(a => a.adjustedBy))];
    const timecardCompanyId = emp?.companyId;
    const allEmps = timecardCompanyId
      ? await dbConn.select().from(employees).where(eq(employees.companyId, timecardCompanyId))
      : await dbConn.select().from(employees).where(inArray(employees.id, adjusterIds.length > 0 ? adjusterIds : [-1]));
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

  // Load company lunch settings for deduction (consistent with payroll PDF)
  let companySettings: { lunchAutoDeduct: boolean; lunchDeductMinutes: number; lunchMinShiftMinutes: number; lunchSkipDays: string | null } | null = null;
  if (emp?.companyId) {
    const company = await getCompanyById(emp.companyId);
    if (company) {
      companySettings = {
        lunchAutoDeduct: company.lunchAutoDeduct,
        lunchDeductMinutes: company.lunchDeductMinutes,
        lunchMinShiftMinutes: company.lunchMinShiftMinutes,
        lunchSkipDays: company.lunchSkipDays,
      };
    }
  }

  // Group by day — use Mountain Time for day grouping (consistent with payroll PDF)
  const TZ_TIMECARD = "America/Denver";
  const dayMap = new Map<string, any[]>();
  let totalMinutes = 0;
  let totalLunchMinutes = 0;
  for (const entry of entries) {
    // Use Mountain Time for day grouping to match PDF reports
    const dayKey = new Date(entry.clockIn).toLocaleDateString("en-CA", { timeZone: TZ_TIMECARD });
    const list = dayMap.get(dayKey) || [];
    const rawMs = entry.clockOut
      ? new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()
      : 0;
    const rawMinutes = Math.max(0, Math.round(rawMs / 60000));
    // Deduct lunch per-entry (consistent with payroll PDF and getLaborCostForJob)
    const entryLunch = (entry as any).lunchMinutes || 0;
    const netMinutes = entry.clockOut
      ? deductLunch(rawMinutes, entryLunch, companySettings, new Date(entry.clockIn))
      : 0; // Active entries (no clockOut) show 0 net minutes
    const lunchDeducted = rawMinutes - netMinutes;
    totalMinutes += netMinutes;
    totalLunchMinutes += lunchDeducted;
    const job = jobMap.get(entry.jobId);
    list.push({
      ...entry,
      jobName: job?.name || "Unknown Job",
      durationMinutes: netMinutes,
      rawDurationMinutes: rawMinutes,
      lunchDeducted,
      adjustments: adjustmentMap.get(entry.id) || [],
    });
    dayMap.set(dayKey, list);
  }

  const days = Array.from(dayMap.entries()).map(([date, dayEntries]) => ({
    date,
    entries: dayEntries,
    totalMinutes: dayEntries.reduce((sum: number, e: any) => sum + e.durationMinutes, 0),
  })).sort((a, b) => b.date.localeCompare(a.date));

  return { days, totalMinutes, totalLunchMinutes, employee: emp };
}


// ─── Punch List Items ────────────────────────────────────────────────────────

export async function getPunchListItems(jobId: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn.select().from(punchListItems)
    .where(eq(punchListItems.jobId, jobId))
    .orderBy(punchListItems.area, punchListItems.sortOrder, punchListItems.createdAt);
}

export async function getAllPunchListItems(companyId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return dbConn.select().from(punchListItems)
    .where(eq(punchListItems.companyId, cid))
    .orderBy(desc(punchListItems.createdAt));
}

export async function createPunchListItem(data: {
  companyId?: number;
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
  const [result] = await dbConn.insert(punchListItems).values({
    ...(data.companyId ? { companyId: data.companyId } : {}),
    jobId: data.jobId,
    area: data.area || null,
    title: data.title,
    description: data.description || null,
    priority: data.priority || "medium",
    assignedTo: data.assignedTo || null,
    createdBy: data.createdBy,
    sortOrder: data.sortOrder || 0,
  });
  return (result as any).insertId as number;
}

export async function createPunchListItemsBulk(items: Array<{
  companyId?: number;
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
    ...(item.companyId ? { companyId: item.companyId } : {}),
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
  }).$returningId();
  // Log the manual addition as an adjustment
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
  // Log the deletion as an adjustment before deleting
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

// ─── Lunch Minutes ────────────────────────────────────────────────────────────────────────────

export async function setLunchMinutes(entryId: number, lunchMinutes: number, adjustedBy: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [existing] = await dbConn.select().from(clockEntries).where(eq(clockEntries.id, entryId));
  if (!existing) return null;
  const oldLunch = existing.lunchMinutes || 0;
  await dbConn.update(clockEntries).set({ lunchMinutes }).where(eq(clockEntries.id, entryId));
  // Log the adjustment
  await dbConn.insert(timeAdjustments).values({
    clockEntryId: entryId,
    adjustedBy,
    fieldChanged: "lunchMinutes",
    oldValue: String(oldLunch),
    newValue: String(lunchMinutes),
    reason: lunchMinutes > 0 ? `Lunch set to ${lunchMinutes} min` : "Lunch removed",
  });
  return { success: true, lunchMinutes };
}

// ─── Clock Entry Helpers ──────────────────────────────────────────────────────────────────────
export async function getClockEntryById(entryId: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [entry] = await dbConn.select().from(clockEntries).where(eq(clockEntries.id, entryId));
  return entry || null;
}

export async function startLunchBreak(entryId: number, employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [entry] = await dbConn.select().from(clockEntries).where(eq(clockEntries.id, entryId));
  if (!entry) return { error: "Entry not found" };
  if (entry.employeeId !== employeeId) return { error: "Not your entry" };
  if (!entry.clockOut === false && entry.clockOut !== null) return { error: "Entry already clocked out" };
  if (entry.lunchStartedAt) return { error: "Lunch already started" };
  await dbConn.update(clockEntries).set({ lunchStartedAt: new Date() }).where(eq(clockEntries.id, entryId));
  return { success: true, lunchStartedAt: new Date().toISOString() };
}

export async function endLunchBreak(entryId: number, employeeId: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [entry] = await dbConn.select().from(clockEntries).where(eq(clockEntries.id, entryId));
  if (!entry) return { error: "Entry not found" };
  if (entry.employeeId !== employeeId) return { error: "Not your entry" };
  if (!entry.lunchStartedAt) return { error: "Lunch not started" };
  const lunchStartTime = new Date(entry.lunchStartedAt).getTime();
  const now = Date.now();
  const elapsedMinutes = Math.max(1, Math.round((now - lunchStartTime) / 60000));
  const newLunchMinutes = Math.min(120, (entry.lunchMinutes || 0) + elapsedMinutes);
  await dbConn.update(clockEntries).set({ lunchMinutes: newLunchMinutes, lunchStartedAt: null }).where(eq(clockEntries.id, entryId));
  // Log the adjustment
  await dbConn.insert(timeAdjustments).values({
    clockEntryId: entryId,
    adjustedBy: employeeId,
    fieldChanged: "lunchMinutes",
    oldValue: String(entry.lunchMinutes || 0),
    newValue: String(newLunchMinutes),
    reason: `Lunch break ended (${elapsedMinutes} min)`,
  });
  return { success: true, lunchMinutes: newLunchMinutes, elapsedMinutes };
}

// ─── Messages / Notes ────────────────────────────────────────────────────────────────────────
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
  companyId?: number;
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
    ...(data.companyId ? { companyId: data.companyId } : {}),
  }).$returningId();

  const messageId = msg.id;

  if (data.isCompanyWide) {
    // Send to all active employees IN THIS COMPANY ONLY
    const companyFilter = data.companyId
      ? and(eq(employees.isActive, true), eq(employees.companyId, data.companyId))
      : eq(employees.isActive, true);
    const allEmployees = await dbConn.select({ id: employees.id }).from(employees).where(companyFilter);
    if (allEmployees.length > 0) {
      await dbConn.insert(messageRecipients).values(
        allEmployees.filter(e => e.id !== data.senderId).map(e => ({
          messageId,
          recipientId: e.id,
        }))
      );
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

  // Get messages where this employee is a recipient OR it's company-wide
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
  return dbConn!
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
  const result = await dbConn!.insert(changeOrders).values({
    jobId: data.jobId,
    description: data.description,
    amount: data.amount,
    orderType: data.orderType,
    status: data.status || "approved",
    createdBy: data.createdBy,
    notes: data.notes || null,
    orderDate: new Date(),
  });
  return { id: result[0].insertId };
}

export async function updateChangeOrderStatus(id: number, status: "pending" | "approved" | "rejected", approvedBy?: number) {
  const dbConn = await getDb();
  await dbConn!
    .update(changeOrders)
    .set({ status, approvedBy: approvedBy || null })
    .where(eq(changeOrders.id, id));
}

export async function deleteChangeOrder(id: number) {
  const dbConn = await getDb();
  await dbConn!.delete(changeOrders).where(eq(changeOrders.id, id));
}

export async function getChangeOrderTotal(jobId: number) {
  const dbConn = await getDb();
  const orders = await dbConn!
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

/**
 * Get job profitability data for all active/completed jobs.
 * Returns: budget, total spend (labor + overhead + expenses), profit margin, change orders.
 */
export async function getJobProfitability(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;

  const allJobs = await db.select().from(jobs).where(eq(jobs.companyId, cid));
  const allEntries = await db.select().from(clockEntries).where(eq(clockEntries.companyId, cid));
  const allEmployees = await db.select().from(employees).where(eq(employees.companyId, cid));
  const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, cid));
  const allChangeOrders = await db.select().from(changeOrders).where(eq(changeOrders.companyId, cid));
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  return allJobs.filter(j => j.status === "active" || j.status === "completed").map(job => {
    const baseBudget = parseFloat((job.totalBudget as string) || "0");

    // Change orders
    const jobCOs = allChangeOrders.filter(co => co.jobId === job.id && co.status === "approved");
    let coTotal = 0;
    for (const co of jobCOs) {
      const amt = parseFloat(String(co.amount) || "0");
      coTotal += co.orderType === "deduct" ? -amt : amt;
    }
    const effectiveBudget = baseBudget + coTotal;

    // Labor
    const jobEntries = allEntries.filter(e => e.jobId === job.id && e.clockOut);
    let laborCost = 0;
    let totalMinutes = 0;
    for (const entry of jobEntries) {
      const mins = Math.max(0, Math.round((new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime()) / 60000));
      totalMinutes += mins;
      const emp = empMap.get(entry.employeeId);
      if (emp?.hourlyRate) {
        laborCost += (mins / 60) * parseFloat(emp.hourlyRate as string);
      }
    }

    // Overhead
    const taxRate = parseFloat((job.taxRate as string) || "0");
    const wcRate = parseFloat((job.workersCompRate as string) || "0");
    const liRate = parseFloat((job.liabilityInsRate as string) || "0");
    const taxCost = laborCost * (taxRate / 100);
    const wcCost = laborCost * (wcRate / 100);
    const liCost = laborCost * (liRate / 100);
    const overheadCost = taxCost + wcCost + liCost;

    // Expenses
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

/**
 * Get tax breakdown across all active jobs.
 * Returns per-job: payroll tax, workers comp, liability insurance, total overhead.
 */
export async function getTaxBreakdown(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;

  const allJobs = await db.select().from(jobs).where(and(eq(jobs.status, "active"), eq(jobs.companyId, cid)));
  const allEntries = await db.select().from(clockEntries).where(eq(clockEntries.companyId, cid));
  const allEmployees = await db.select().from(employees).where(eq(employees.companyId, cid));
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  return allJobs.map(job => {
    const jobEntries = allEntries.filter(e => e.jobId === job.id && e.clockOut);
    let laborCost = 0;
    for (const entry of jobEntries) {
      const mins = Math.max(0, Math.round((new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime()) / 60000));
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

/**
 * Get budget burn-down data for a specific job over time.
 * Returns weekly cumulative spend vs budget line.
 */
export async function getBudgetBurnDown(jobId: number, weeks: number = 12) {
  const db = await getDb();
  if (!db) return { job: null, burnDown: [] };

  const job = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job.length) return { job: null, burnDown: [] };
  const theJob = job[0];

  const baseBudget = parseFloat((theJob.totalBudget as string) || "0");
  // Get change order total
  const jobCOs = await db.select().from(changeOrders).where(and(eq(changeOrders.jobId, jobId), eq(changeOrders.status, "approved")));
  let coTotal = 0;
  for (const co of jobCOs) {
    const amt = parseFloat(String(co.amount) || "0");
    coTotal += co.orderType === "deduct" ? -amt : amt;
  }
  const effectiveBudget = baseBudget + coTotal;

  // Get all clock entries for this job
  const jobEntries = await db.select().from(clockEntries).where(eq(clockEntries.jobId, jobId));
  // Scope employee lookup to the job's company to prevent cross-company data leakage
  const burnJobCompanyId = theJob.companyId;
  const allEmployees = burnJobCompanyId
    ? await db.select().from(employees).where(eq(employees.companyId, burnJobCompanyId))
    : [];
  const empMap = new Map(allEmployees.map(e => [e.id, e]));
  // Get all expenses for this jobb
  const jobExpenses = await db.select().from(expenses).where(eq(expenses.jobId, jobId));

  // Build weekly buckets going back N weeks
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

  // Calculate spend before the window
  for (const entry of jobEntries) {
    if (!entry.clockOut) continue;
    const clockInDate = new Date(entry.clockIn);
    if (clockInDate >= startDate) continue;
    const mins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
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

    // Labor cost this week
    let weekLabor = 0;
    for (const entry of jobEntries) {
      if (!entry.clockOut) continue;
      const clockInDate = new Date(entry.clockIn);
      if (clockInDate < ws || clockInDate >= we) continue;
      const mins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
      const emp = empMap.get(entry.employeeId);
      if (emp?.hourlyRate) {
        weekLabor += (mins / 60) * parseFloat(emp.hourlyRate as string);
      }
    }
    // Add overhead to labor
    const taxRate = parseFloat((theJob.taxRate as string) || "0");
    const wcRate = parseFloat((theJob.workersCompRate as string) || "0");
    const liRate = parseFloat((theJob.liabilityInsRate as string) || "0");
    weekLabor *= (1 + (taxRate + wcRate + liRate) / 100);

    // Expenses this week
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

/**
 * Get monthly labor cost trend for the past N months.
 * Returns: array of { monthLabel, totalCost, totalMinutes, laborOnly, taxCost, wcCost, liCost }
 */
export async function getMonthlyLaborTrend(months: number = 6, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const entries = await db.select().from(clockEntries).where(and(gte(clockEntries.clockIn, startDate), eq(clockEntries.companyId, cid)));
  const allEmployees = await db.select().from(employees).where(eq(employees.companyId, cid));
  const allJobs = await db.select().from(jobs).where(eq(jobs.companyId, cid));
  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  // Build month buckets
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

  // Average tax rates across all active jobs for overhead calculation
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

    const mins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - clockInDate.getTime()) / 60000));
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
  const [result] = await dbConn.insert(budgetAuditLog).values(entry);
  return result.insertId;
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

export async function getJobProfitabilityFiltered(startDate?: string, endDate?: string, companyId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  if (!companyId) return [] as any; const cid = companyId;

  const allJobs = await dbConn.select().from(jobs).where(and(eq(jobs.status, "active"), eq(jobs.companyId, cid)));
  const allBudgets = await dbConn.select().from(budgetCategories);
  const allChangeOrderRows = await dbConn.select().from(changeOrders);

  // Build date filter for clock entries
  let clockConditions: any[] = [eq(clockEntries.companyId, cid)];
  if (startDate) clockConditions.push(gte(clockEntries.clockIn, new Date(startDate)));
  if (endDate) clockConditions.push(lte(clockEntries.clockIn, new Date(endDate)));

  const clockRows = await dbConn.select().from(clockEntries).where(and(...clockConditions));

  // Build date filter for expenses
  let expConditions: any[] = [eq(expenses.companyId, cid)];
  if (startDate) expConditions.push(gte(expenses.expenseDate, new Date(startDate)));
  if (endDate) expConditions.push(lte(expenses.expenseDate, new Date(endDate)));

  const expenseRows = await dbConn.select().from(expenses).where(and(...expConditions));

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

export async function getMonthlyLaborTrendFiltered(startDate?: string, endDate?: string, companyId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  if (!companyId) return [] as any; const cid = companyId;

  let conditions: any[] = [eq(clockEntries.companyId, cid)];
  if (startDate) conditions.push(gte(clockEntries.clockIn, new Date(startDate)));
  if (endDate) conditions.push(lte(clockEntries.clockIn, new Date(endDate)));

  const clockRows = await dbConn.select().from(clockEntries).where(and(...conditions));

  const allEmployees = await dbConn.select().from(employees).where(eq(employees.companyId, cid));
  const rateMap = new Map(allEmployees.map(e => [e.id, Number(e.hourlyRate || 35)]));

  // Group by month
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

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => {
      const [y, m] = key.split("-");
      return {
        monthLabel: `${months[parseInt(m) - 1]} ${y}`,
        totalMinutes: Math.round(b.totalMinutes),
        laborOnly: Math.round(b.laborOnly * 100) / 100,
        taxCost: Math.round(b.taxCost * 100) / 100,
        wcCost: Math.round(b.wcCost * 100) / 100,
        liCost: Math.round(b.liCost * 100) / 100,
        totalCost: Math.round((b.laborOnly + b.taxCost + b.wcCost + b.liCost) * 100) / 100,
      };
    });
}


// ─── Company Overhead / Monthly Expenses ──────────────────────────────────
export async function getCompanyOverhead(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(companyOverhead).where(and(eq(companyOverhead.isActive, true), eq(companyOverhead.companyId, cid)));
}

export async function getAllCompanyOverhead(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(companyOverhead).where(eq(companyOverhead.companyId, cid));
}

export async function createOverheadItem(data: Omit<InsertCompanyOverhead, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(companyOverhead).values(data);
  return result[0].insertId;
}

export async function updateOverheadItem(id: number, data: Partial<InsertCompanyOverhead>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(companyOverhead).set(data).where(eq(companyOverhead.id, id));
}

export async function deleteOverheadItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(companyOverhead).set({ isActive: false }).where(eq(companyOverhead.id, id));
}

export async function getMonthlyOverheadTotal(companyId?: number) {
  const items = await getCompanyOverhead(companyId);
  return items.reduce((sum: number, item: any) => sum + parseFloat((item.monthlyAmount as string) || "0"), 0);
}

// ─── Job Schedule / Calendar ──────────────────────────────────────────────
export async function getJobSchedule(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobSchedule).where(eq(jobSchedule.jobId, jobId));
}

export async function getAllScheduleItems(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select({
    id: jobSchedule.id,
    jobId: jobSchedule.jobId,
    title: jobSchedule.title,
    description: jobSchedule.description,
    phase: jobSchedule.phase,
    scheduledDate: jobSchedule.scheduledDate,
    endDate: jobSchedule.endDate,
    status: jobSchedule.status,
    assignedEmployees: jobSchedule.assignedEmployees,
    sortOrder: jobSchedule.sortOrder,
    createdAt: jobSchedule.createdAt,
    updatedAt: jobSchedule.updatedAt,
    jobName: jobs.name,
  }).from(jobSchedule).leftJoin(jobs, eq(jobSchedule.jobId, jobs.id)).where(eq(jobSchedule.companyId, cid));
}

export async function getScheduleByDateRange(startDate: Date, endDate: Date, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(jobSchedule)
    .where(and(
      gte(jobSchedule.scheduledDate, startDate),
      lte(jobSchedule.scheduledDate, endDate),
      eq(jobSchedule.companyId, cid),
    ));
}

export async function createScheduleItem(data: Omit<InsertJobSchedule, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(jobSchedule).values(data);
  return result[0].insertId;
}

export async function updateScheduleItem(id: number, data: Partial<InsertJobSchedule>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(jobSchedule).set(data).where(eq(jobSchedule.id, id));
}

export async function deleteScheduleItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(jobSchedule).where(eq(jobSchedule.id, id));
}

// ─── Employee Tax Info ────────────────────────────────────────────────────
export async function getEmployeeTaxInfo(employeeId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(employeeTaxInfo).where(eq(employeeTaxInfo.employeeId, employeeId));
  return rows[0] || null;
}

export async function getAllEmployeeTaxInfo(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!companyId) return [] as any; const cid = companyId;
  return db.select().from(employeeTaxInfo).where(eq(employeeTaxInfo.companyId, cid));
}

// SECURITY FIX (Low #17): SSN encryption wrapper
async function encryptTaxData(data: any): Promise<any> {
  if (data.ssn && !isEncrypted(data.ssn)) {
    return { ...data, ssn: encryptSSN(data.ssn) };
  }
  return data;
}
async function decryptTaxData(record: any): Promise<any> {
  if (record && record.ssn && isEncrypted(record.ssn)) {
    return { ...record, ssnLast4: getSSNLast4(record.ssn), ssn: "***-**-" + getSSNLast4(record.ssn) };
  }
  return record;
}

export async function upsertEmployeeTaxInfo(employeeId: number, data: Partial<InsertEmployeeTaxInfo>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getEmployeeTaxInfo(employeeId);
  if (existing) {
    await db.update(employeeTaxInfo).set({ ...data, updatedBy: data.updatedBy || existing.updatedBy }).where(eq(employeeTaxInfo.employeeId, employeeId));
    return existing.id;
  } else {
    const result = await db.insert(employeeTaxInfo).values({ employeeId, updatedBy: data.updatedBy || 0, ...data } as InsertEmployeeTaxInfo);
    return result[0].insertId;
  }
}

// ─── Support Tickets ─────────────────────────────────────────────────────────
export async function createSupportTicket(data: Omit<InsertSupportTicket, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(supportTickets).values(data);
  return result[0].insertId;
}

export async function getSupportTickets(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(supportTickets).where(eq(supportTickets.companyId, companyId)).orderBy(desc(supportTickets.createdAt));
  }
  return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
}

export async function getSupportTicketById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  return rows[0] || null;
}

export async function getTicketByTrackingToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(supportTickets).where(eq(supportTickets.trackingToken, token)).limit(1);
  return rows[0] || null;
}

export async function updateSupportTicket(id: number, data: Partial<InsertSupportTicket>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(supportTickets).set(data).where(eq(supportTickets.id, id));
}

export async function getSupportTicketsByStatus(status: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(supportTickets).where(and(eq(supportTickets.status, status as any), eq(supportTickets.companyId, companyId))).orderBy(desc(supportTickets.createdAt));
  }
  return db.select().from(supportTickets).where(eq(supportTickets.status, status as any)).orderBy(desc(supportTickets.createdAt));
}

// ─── Support Ticket Replies ──────────────────────────────────────────────────
export async function createTicketReply(data: Omit<InsertSupportTicketReply, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(supportTicketReplies).values(data);
  return result[0].insertId;
}

export async function getTicketReplies(ticketId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supportTicketReplies).where(eq(supportTicketReplies.ticketId, ticketId)).orderBy(supportTicketReplies.createdAt);
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────
export async function createKBArticle(data: Omit<InsertKnowledgeBaseArticle, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(knowledgeBase).values(data);
  return result[0].insertId;
}

export async function getKBArticles(publishedOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (publishedOnly) {
    return db.select().from(knowledgeBase).where(eq(knowledgeBase.isPublished, true)).orderBy(desc(knowledgeBase.updatedAt));
  }
  return db.select().from(knowledgeBase).orderBy(desc(knowledgeBase.updatedAt));
}

export async function getKBArticleById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).limit(1);
  return rows[0] || null;
}

export async function getKBArticleBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(knowledgeBase).where(eq(knowledgeBase.slug, slug)).limit(1);
  return rows[0] || null;
}

export async function updateKBArticle(id: number, data: Partial<InsertKnowledgeBaseArticle>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(knowledgeBase).set(data).where(eq(knowledgeBase.id, id));
}

export async function incrementKBViewCount(id: number) {
  const db = await getDb();
  if (!db) return;
  const article = await getKBArticleById(id);
  if (article) {
    await db.update(knowledgeBase).set({ viewCount: (article.viewCount || 0) + 1 }).where(eq(knowledgeBase.id, id));
  }
}

export async function searchKBArticles(query: string) {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(knowledgeBase).where(eq(knowledgeBase.isPublished, true));
  const q = query.toLowerCase();
  return all.filter((a: any) =>
    a.title.toLowerCase().includes(q) ||
    a.content.toLowerCase().includes(q) ||
    (a.tags && a.tags.toLowerCase().includes(q))
  );
}

// ─── Pivot Support Learning ──────────────────────────────────────────────────
export async function createSupportLearning(data: Omit<InsertPivotSupportLearningEntry, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(pivotSupportLearning).values(data);
  return result[0].insertId;
}

export async function getSupportLearnings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pivotSupportLearning).orderBy(desc(pivotSupportLearning.timesHelpful));
}

export async function getSupportLearningByCategory(category: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pivotSupportLearning).where(eq(pivotSupportLearning.category, category));
}

export async function updateSupportLearning(id: number, data: Partial<InsertPivotSupportLearningEntry>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(pivotSupportLearning).set(data).where(eq(pivotSupportLearning.id, id));
}

export async function searchSupportLearnings(query: string) {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(pivotSupportLearning);
  const q = query.toLowerCase();
  return all.filter((l: any) =>
    l.problem.toLowerCase().includes(q) ||
    l.solution.toLowerCase().includes(q) ||
    (l.category && l.category.toLowerCase().includes(q))
  );
}

// ─── Support Stats (Admin Dashboard) ─────────────────────────────────────────
export async function getSupportStats() {
  const db = await getDb();
  if (!db) return { totalTickets: 0, openTickets: 0, resolvedTickets: 0, avgResolutionHours: 0, kbArticles: 0, learnings: 0 };
  
  const allTickets = await db.select().from(supportTickets);
  const openTickets = allTickets.filter((t: any) => t.status === "open" || t.status === "in_progress");
  const resolvedTickets = allTickets.filter((t: any) => t.status === "resolved" || t.status === "closed");
  
  // Calculate average resolution time
  let totalHours = 0;
  let resolvedCount = 0;
  for (const t of resolvedTickets) {
    if (t.resolvedAt && t.createdAt) {
      const hours = (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
      totalHours += hours;
      resolvedCount++;
    }
  }
  
  const allKB = await db.select().from(knowledgeBase);
  const allLearnings = await db.select().from(pivotSupportLearning);
  
  return {
    totalTickets: allTickets.length,
    openTickets: openTickets.length,
    resolvedTickets: resolvedTickets.length,
    avgResolutionHours: resolvedCount > 0 ? Math.round(totalHours / resolvedCount * 10) / 10 : 0,
    kbArticles: allKB.length,
    learnings: allLearnings.length,
  };
}


// ─── Trade Knowledge (Pivot Hivemind) ───────────────────────────────────────

export async function getTradeKnowledge(tradeSlug: string, category?: string) {
  const db = await getDb();
  if (!db) return [];
  if (category) {
    return db.select().from(tradeKnowledge)
      .where(and(eq(tradeKnowledge.tradeSlug, tradeSlug), eq(tradeKnowledge.category, category as any), eq(tradeKnowledge.isActive, true)));
  }
  return db.select().from(tradeKnowledge)
    .where(and(eq(tradeKnowledge.tradeSlug, tradeSlug), eq(tradeKnowledge.isActive, true)));
}

export async function getTradeKnowledgeForMultipleTrades(tradeSlugs: string[]) {
  const db = await getDb();
  if (!db) return [];
  const results: any[] = [];
  for (const slug of tradeSlugs) {
    const rows = await db.select().from(tradeKnowledge)
      .where(and(eq(tradeKnowledge.tradeSlug, slug), eq(tradeKnowledge.isActive, true)));
    results.push(...rows);
  }
  return results;
}

export async function createTradeKnowledge(data: Omit<InsertTradeKnowledge, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tradeKnowledge).values(data);
  return result[0].insertId;
}

export async function getTradeBenchmarks(tradeSlug: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tradeBenchmarks).where(eq(tradeBenchmarks.tradeSlug, tradeSlug));
}

export async function upsertTradeBenchmark(data: Omit<InsertTradeBenchmark, "id" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(tradeBenchmarks)
    .where(and(eq(tradeBenchmarks.tradeSlug, data.tradeSlug), eq(tradeBenchmarks.metricName, data.metricName)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(tradeBenchmarks).set({
      metricValue: data.metricValue,
      sampleSize: data.sampleSize,
      unit: data.unit,
      region: data.region,
    }).where(eq(tradeBenchmarks.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(tradeBenchmarks).values(data);
  return result[0].insertId;
}

export async function getCompanyWithTrades(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!rows[0]) return null;
  const company = rows[0];
  return {
    ...company,
    tradesList: company.trades ? JSON.parse(company.trades as string) as string[] : [],
  };
}


// ─── Push Notification Token Management ─────────────────────────────────────

export async function updatePushToken(employeeId: number, pushToken: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(employees).set({ pushToken }).where(eq(employees.id, employeeId));
}

export async function clearPushToken(employeeId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(employees).set({ pushToken: null }).where(eq(employees.id, employeeId));
}

export async function getPushTokensForEmployees(employeeIds: number[]): Promise<Array<{ id: number; name: string; pushToken: string }>> {
  const db = await getDb();
  if (!db) return [];
  if (employeeIds.length === 0) return [];
  const rows = await db.select({
    id: employees.id,
    name: employees.name,
    pushToken: employees.pushToken,
  }).from(employees).where(
    and(
      inArray(employees.id, employeeIds),
      isNotNull(employees.pushToken),
      eq(employees.isActive, true),
    )
  );
  return rows.filter((r): r is { id: number; name: string; pushToken: string } => !!r.pushToken);
}

export async function getAllPushTokens(companyId?: number): Promise<Array<{ id: number; name: string; pushToken: string }>> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [isNotNull(employees.pushToken), eq(employees.isActive, true)];
  if (companyId) conditions.push(eq(employees.companyId, companyId));
  const rows = await db.select({
    id: employees.id,
    name: employees.name,
    pushToken: employees.pushToken,
  }).from(employees).where(and(...conditions));
  return rows.filter((r): r is { id: number; name: string; pushToken: string } => !!r.pushToken);
}


// ─── Security Audit Logging ──────────────────────────────────────────────────
export async function logSecurityEvent(data: {
  companyId?: number | null;
  employeeId?: number | null;
  eventType: "login_failed" | "login_success" | "rate_limit_triggered" | "ownership_violation" | "admin_action" | "data_access_denied" | "account_lockout";
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: string | null;
  severity?: "low" | "medium" | "high" | "critical";
}) {
  try {
    const dbConn = await getDb();
    if (!dbConn) return null;
    await dbConn.insert(securityAuditLog).values({
      companyId: data.companyId || null,
      employeeId: data.employeeId || null,
      eventType: data.eventType,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      details: data.details || null,
      severity: data.severity || "medium",
    });
  } catch (err) {
    // Never let audit logging break the main flow
    console.error("[audit] Failed to log security event:", err);
  }
}

export async function getSecurityAuditLogs(companyId: number, options?: { limit?: number; eventType?: string }) {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const conditions: any[] = [eq(securityAuditLog.companyId, companyId)];
  if (options?.eventType) {
    conditions.push(eq(securityAuditLog.eventType, options.eventType as any));
  }
  return dbConn.select().from(securityAuditLog)
    .where(and(...conditions))
    .orderBy(desc(securityAuditLog.createdAt))
    .limit(options?.limit || 100);
}

// ─── Admin IP Allowlist ──────────────────────────────────────────────────────
export async function getAdminIpAllowlist() {
  const dbConn = await getDb();
  if (!dbConn) return [];
  return dbConn.select().from(adminIpAllowlist).where(eq(adminIpAllowlist.isActive, true));
}

export async function addAdminIp(data: { ipAddress: string; label?: string; addedBy: number }) {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const [result] = await dbConn.insert(adminIpAllowlist).values({
    ipAddress: data.ipAddress,
    label: data.label || null,
    addedBy: data.addedBy,
  }).$returningId();
  return result.id;
}

export async function removeAdminIp(id: number) {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.update(adminIpAllowlist).set({ isActive: false }).where(eq(adminIpAllowlist.id, id));
}

// ═══ DATA AUDIT LOGGING ═══
// Logs all write operations (INSERT/UPDATE/DELETE) for forensic traceability
export async function logDataAudit(params: {
  companyId?: number | null;
  employeeId?: number | null;
  userId?: number | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
  tableName: string;
  recordId?: number | null;
  previousData?: any;
  newData?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    const dbConn = await getDb();
    if (!dbConn) return;
    const { dataAuditLog } = await import("../drizzle/schema");
    await dbConn.insert(dataAuditLog).values({
      companyId: params.companyId ?? null,
      employeeId: params.employeeId ?? null,
      userId: params.userId ?? null,
      operation: params.operation,
      tableName: params.tableName,
      recordId: params.recordId ?? null,
      previousData: params.previousData ? JSON.parse(JSON.stringify(params.previousData)) : null,
      newData: params.newData ? JSON.parse(JSON.stringify(params.newData)) : null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });
  } catch (err) {
    // Audit logging should never crash the main operation
    console.error("[audit] Failed to log data audit:", err);
  }
}
