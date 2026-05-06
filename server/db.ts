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
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

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


// Employee PIN security and company scoping helpers.
// The mobile app historically used plaintext employee PINs in a single-company table.
// These helpers add a backward-compatible managed PIN layer: legacy PINs still verify,
// while admin-reset PINs are stored as PBKDF2 hashes and never returned to clients.
const PIN_HASH_ITERATIONS = 160_000;
let employeePinSecurityEnsured = false;
let ensuringEmployeePinSecurity: Promise<void> | null = null;

function rowsFromExecute<T = any>(result: any): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function hashEmployeePin(pin: string) {
  const salt = randomBytes(24).toString("hex");
  const derived = pbkdf2Sync(pin, salt, PIN_HASH_ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${PIN_HASH_ITERATIONS}$${salt}$${derived}`;
}

function verifyEmployeePinHash(pin: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, iterationText, salt, expectedHex] = storedHash.split("$");
  const iterations = Number.parseInt(iterationText, 10);
  if (algorithm !== "pbkdf2_sha256" || !Number.isFinite(iterations) || !salt || !expectedHex) return false;
  const actual = pbkdf2Sync(pin, salt, iterations, 32, "sha256");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function fingerprintPin(pin: string) {
  return createHash("sha256").update(pin).digest("hex").slice(0, 12);
}

function slugifyCompanyName(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "company";
}

async function tryExecute(statement: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await (db as any).execute(sql.raw(statement));
  } catch (error: any) {
    const message = String(error?.message || error || "");
    if (/Duplicate column name|already exists/i.test(message)) return;
    throw error;
  }
}

export async function ensureEmployeePinSecurity() {
  if (employeePinSecurityEnsured) return;
  if (ensuringEmployeePinSecurity) return ensuringEmployeePinSecurity;
  ensuringEmployeePinSecurity = (async () => {
    const db = await getDb();
    if (!db) return;
    await tryExecute(`CREATE TABLE IF NOT EXISTS companies (
      id int AUTO_INCREMENT NOT NULL,
      name varchar(128) NOT NULL,
      slug varchar(128) NOT NULL,
      isActive boolean NOT NULL DEFAULT true,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT companies_id PRIMARY KEY(id),
      CONSTRAINT companies_slug_unique UNIQUE(slug)
    )`);
    await tryExecute("ALTER TABLE employees ADD COLUMN companyId int NULL");
    await tryExecute("ALTER TABLE employees ADD COLUMN pinHash varchar(255) NULL");
    await tryExecute("ALTER TABLE employees ADD COLUMN pinUpdatedAt timestamp NULL");
    await tryExecute("ALTER TABLE employees ADD COLUMN pinDisabled boolean NOT NULL DEFAULT false");
    await (db as any).execute(sql.raw("INSERT IGNORE INTO companies (id, name, slug) VALUES (1, 'BuildTrack Pro', 'buildtrack-pro')"));
    await (db as any).execute(sql.raw("UPDATE employees SET companyId = 1 WHERE companyId IS NULL"));
    employeePinSecurityEnsured = true;
  })().catch((error) => {
    ensuringEmployeePinSecurity = null;
    console.warn("[Database] Failed to ensure employee PIN security schema:", error);
    throw error;
  });
  return ensuringEmployeePinSecurity;
}

type AdminPinEmployeeRow = {
  id: number;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  isActive: number | boolean;
  hourlyRate: string | null;
  inviteStatus: string | null;
  updatedAt: Date | string | null;
  companyId: number | null;
  companyName: string | null;
  pinHash: string | null;
  pinUpdatedAt: Date | string | null;
  pinDisabled: number | boolean | null;
};

export async function listAdminPinManagement() {
  await ensureEmployeePinSecurity();
  const db = await getDb();
  if (!db) return { companies: [], employees: [] };
  const companyRows = rowsFromExecute<any>(await (db as any).execute(sql.raw(`
    SELECT id, name, slug, isActive, createdAt, updatedAt
    FROM companies
    ORDER BY name ASC
  `)));
  const employeeRows = rowsFromExecute<AdminPinEmployeeRow>(await (db as any).execute(sql.raw(`
    SELECT e.id, e.name, e.role, e.email, e.phone, e.isActive, e.hourlyRate, e.inviteStatus, e.updatedAt,
           e.companyId, c.name AS companyName, e.pinHash, e.pinUpdatedAt, e.pinDisabled
    FROM employees e
    LEFT JOIN companies c ON c.id = e.companyId
    ORDER BY COALESCE(c.name, 'Unassigned') ASC, e.name ASC
  `)));
  return {
    companies: companyRows.map((company) => ({
      id: Number(company.id),
      name: String(company.name),
      slug: String(company.slug),
      isActive: Boolean(company.isActive),
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    })),
    employees: employeeRows.map((employee) => ({
      id: Number(employee.id),
      name: employee.name,
      role: employee.role,
      email: employee.email,
      phone: employee.phone,
      isActive: Boolean(employee.isActive),
      hourlyRate: employee.hourlyRate,
      inviteStatus: employee.inviteStatus || "accepted",
      updatedAt: employee.updatedAt,
      companyId: employee.companyId ? Number(employee.companyId) : null,
      companyName: employee.companyName || "Unassigned",
      pinStatus: employee.pinDisabled ? "disabled" : employee.pinHash ? "managed_hash" : "legacy_plain",
      pinUpdatedAt: employee.pinUpdatedAt,
    })),
  };
}

export async function createCompanyForAdmin(name: string) {
  await ensureEmployeePinSecurity();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cleanName = name.trim();
  const baseSlug = slugifyCompanyName(cleanName);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;
  const result: any = await (db as any).execute(sql`INSERT INTO companies (name, slug) VALUES (${cleanName}, ${slug})`);
  const firstPacket: any = Array.isArray(result) ? result[0] : result;
  const insertId = firstPacket?.insertId;
  return { id: Number(insertId || 0), name: cleanName, slug };
}

export async function setEmployeeCompanyForAdmin(employeeId: number, companyId: number) {
  await ensureEmployeePinSecurity();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const companies = rowsFromExecute<any>(await (db as any).execute(sql`SELECT id FROM companies WHERE id = ${companyId} AND isActive = true LIMIT 1`));
  if (companies.length === 0) throw new Error("Company not found");
  await (db as any).execute(sql`UPDATE employees SET companyId = ${companyId} WHERE id = ${employeeId}`);
}

export async function resetEmployeePinForAdmin(employeeId: number, pin: string) {
  await ensureEmployeePinSecurity();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = rowsFromExecute<any>(await (db as any).execute(sql`SELECT id, name, companyId FROM employees WHERE id = ${employeeId} LIMIT 1`));
  if (rows.length === 0) throw new Error("Employee not found");
  const pinHash = hashEmployeePin(pin);
  const placeholder = `managed_${fingerprintPin(pin)}`;
  await (db as any).execute(sql`
    UPDATE employees
    SET pin = ${placeholder}, pinHash = ${pinHash}, pinDisabled = false, pinUpdatedAt = CURRENT_TIMESTAMP, inviteStatus = 'accepted'
    WHERE id = ${employeeId}
  `);
  return { employeeId, employeeName: String(rows[0].name), companyId: rows[0].companyId ? Number(rows[0].companyId) : null };
}

export async function setEmployeePinDisabledForAdmin(employeeId: number, disabled: boolean) {
  await ensureEmployeePinSecurity();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = rowsFromExecute<any>(await (db as any).execute(sql`SELECT id, name, companyId FROM employees WHERE id = ${employeeId} LIMIT 1`));
  if (rows.length === 0) throw new Error("Employee not found");
  await (db as any).execute(sql`UPDATE employees SET pinDisabled = ${disabled}, pinUpdatedAt = CURRENT_TIMESTAMP WHERE id = ${employeeId}`);
  return { employeeId, employeeName: String(rows[0].name), companyId: rows[0].companyId ? Number(rows[0].companyId) : null, disabled };
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
  await ensureEmployeePinSecurity();

  const legacyRows = rowsFromExecute<any>(await (db as any).execute(sql`
    SELECT * FROM employees
    WHERE isActive = true AND (pinDisabled IS NULL OR pinDisabled = false) AND pin = ${pin}
    LIMIT 1
  `));
  if (legacyRows[0]) return legacyRows[0];

  const managedRows = rowsFromExecute<any>(await (db as any).execute(sql`
    SELECT * FROM employees
    WHERE isActive = true AND (pinDisabled IS NULL OR pinDisabled = false) AND pinHash IS NOT NULL
  `));
  return managedRows.find((employee) => verifyEmployeePinHash(pin, employee.pinHash));
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
