import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
} from "drizzle-orm/mysql-core";

// ─── Users (Manus OAuth) ───────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── Employees ─────────────────────────────────────────────────────────────
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  role: mysqlEnum("role", ["owner", "secretary", "logistics", "foreman", "laborer"])
    .default("laborer")
    .notNull(),
  pin: varchar("pin", { length: 64 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  isActive: boolean("isActive").default(true).notNull(),
  hourlyRate: decimal("hourlyRate", { precision: 8, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Jobs / Jobsites ───────────────────────────────────────────────────────
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  clientName: varchar("clientName", { length: 128 }),
  clientPhone: varchar("clientPhone", { length: 20 }),
  status: mysqlEnum("status", ["active", "paused", "completed", "cancelled"])
    .default("active")
    .notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  totalBudget: decimal("totalBudget", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  latitude: float("latitude"),
  longitude: float("longitude"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Job Assignments ───────────────────────────────────────────────────────
export const jobAssignments = mysqlTable("jobAssignments", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  employeeId: int("employeeId").notNull(),
  role: mysqlEnum("role", ["foreman", "laborer"]).default("laborer").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
});

// ─── Clock Entries ─────────────────────────────────────────────────────────
export const clockEntries = mysqlTable("clockEntries", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  jobId: int("jobId").notNull(),
  clockIn: timestamp("clockIn").notNull(),
  clockOut: timestamp("clockOut"),
  clockInLatitude: float("clockInLatitude"),
  clockInLongitude: float("clockInLongitude"),
  clockOutLatitude: float("clockOutLatitude"),
  clockOutLongitude: float("clockOutLongitude"),
  isOfflineEntry: boolean("isOfflineEntry").default(false).notNull(),
  localId: varchar("localId", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Daily Reports ─────────────────────────────────────────────────────────
export const dailyReports = mysqlTable("dailyReports", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  submittedBy: int("submittedBy").notNull(),
  reportDate: timestamp("reportDate").notNull(),
  workCompleted: text("workCompleted"),
  notes: text("notes"),
  weatherCondition: varchar("weatherCondition", { length: 64 }),
  crewCount: int("crewCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Materials Used ────────────────────────────────────────────────────────
export const materialEntries = mysqlTable("materialEntries", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("reportId").notNull(),
  jobId: int("jobId").notNull(),
  materialName: varchar("materialName", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("units"),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  supplier: varchar("supplier", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Report Photos ─────────────────────────────────────────────────────────
export const reportPhotos = mysqlTable("reportPhotos", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("reportId").notNull(),
  jobId: int("jobId").notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  caption: text("caption"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Budget Categories ─────────────────────────────────────────────────────
export const budgetCategories = mysqlTable("budgetCategories", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  budgetedAmount: decimal("budgetedAmount", { precision: 12, scale: 2 }).notNull(),
  spentAmount: decimal("spentAmount", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Expenses ──────────────────────────────────────────────────────────────
export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  categoryId: int("categoryId"),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: timestamp("expenseDate").notNull(),
  receiptUrl: text("receiptUrl"),
  submittedBy: int("submittedBy").notNull(),
  qbSynced: boolean("qbSynced").default(false).notNull(),
  qbSyncedAt: timestamp("qbSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── QuickBooks Sync Log ───────────────────────────────────────────────────
export const qbSyncLog = mysqlTable("qbSyncLog", {
  id: int("id").autoincrement().primaryKey(),
  syncType: mysqlEnum("syncType", ["expenses", "labor", "full"]).notNull(),
  status: mysqlEnum("status", ["pending", "success", "failed"]).default("pending").notNull(),
  itemsSynced: int("itemsSynced").default(0),
  errorMessage: text("errorMessage"),
  triggeredBy: int("triggeredBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// ─── Types ─────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;
export type EmployeeRole = "owner" | "secretary" | "logistics" | "foreman" | "laborer";

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;
export type JobStatus = "active" | "paused" | "completed" | "cancelled";

export type JobAssignment = typeof jobAssignments.$inferSelect;
export type InsertJobAssignment = typeof jobAssignments.$inferInsert;

export type ClockEntry = typeof clockEntries.$inferSelect;
export type InsertClockEntry = typeof clockEntries.$inferInsert;

export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = typeof dailyReports.$inferInsert;

export type MaterialEntry = typeof materialEntries.$inferSelect;
export type InsertMaterialEntry = typeof materialEntries.$inferInsert;

export type ReportPhoto = typeof reportPhotos.$inferSelect;
export type InsertReportPhoto = typeof reportPhotos.$inferInsert;

export type BudgetCategory = typeof budgetCategories.$inferSelect;
export type InsertBudgetCategory = typeof budgetCategories.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

export type QbSyncLog = typeof qbSyncLog.$inferSelect;
