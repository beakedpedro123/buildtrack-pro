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
  role: mysqlEnum("role", ["owner", "office_manager", "secretary", "logistics", "foreman", "laborer"])
    .default("laborer")
    .notNull(),
  pin: varchar("pin", { length: 64 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  isActive: boolean("isActive").default(true).notNull(),
  hourlyRate: decimal("hourlyRate", { precision: 8, scale: 2 }),
  payType: mysqlEnum("payType", ["hourly", "salary"]).default("hourly").notNull(),
  salaryAmount: decimal("salaryAmount", { precision: 12, scale: 2 }),
  salaryProjects: text("salaryProjects"),  // JSON array of up to 6 job IDs for salary distribution
  inviteToken: varchar("inviteToken", { length: 64 }),
  inviteStatus: mysqlEnum("inviteStatus", ["pending", "accepted"]).default("accepted"),
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
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0"),
  workersCompRate: decimal("workersCompRate", { precision: 5, scale: 2 }).default("0"),
  liabilityInsRate: decimal("liabilityInsRate", { precision: 5, scale: 2 }).default("0"),
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
  seenByOwner: boolean("seenByOwner").default(false).notNull(),
  seenAt: timestamp("seenAt"),
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

// ─── Meetings ─────────────────────────────────────────────────────────────
export const meetings = mysqlTable("meetings", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  scheduledFor: timestamp("scheduledFor"),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  status: mysqlEnum("status", ["scheduled", "recording", "processing", "completed", "cancelled"]).default("scheduled").notNull(),
  audioUrl: text("audioUrl"),
  transcript: text("transcript"),
  summary: text("summary"),
  attendees: text("attendees"), // JSON array of employee IDs
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Weekly Goals ──────────────────────────────────────────────────────────
export const weeklyGoals = mysqlTable("weeklyGoals", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignedTo: int("assignedTo"),
  assignedToList: varchar("assignedToList", { length: 255 }),
  weekOf: timestamp("weekOf").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  deadline: timestamp("deadline"),
  createdBy: int("createdBy").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── QuickBooks Estimates ────────────────────────────────────────────────────
export const qbEstimates = mysqlTable("qbEstimates", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  qbEstimateId: varchar("qbEstimateId", { length: 64 }),
  qbEstimateNumber: varchar("qbEstimateNumber", { length: 64 }),
  clientName: varchar("clientName", { length: 128 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 32 }).default("pending"),
  lineItems: text("lineItems"), // JSON array of line items
  issueDate: timestamp("issueDate"),
  expiryDate: timestamp("expiryDate"),
  notes: text("notes"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── KPI Metrics ──────────────────────────────────────────────────────────────
export const kpiMetrics = mysqlTable("kpiMetrics", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  category: mysqlEnum("category", ["revenue", "labor", "jobs", "safety", "schedule", "custom"]).default("custom").notNull(),
  unit: varchar("unit", { length: 32 }).default(""),  // e.g. "$", "%", "hrs", "jobs"
  targetValue: decimal("targetValue", { precision: 12, scale: 2 }),
  currentValue: decimal("currentValue", { precision: 12, scale: 2 }).default("0"),
  description: text("description"),
  period: mysqlEnum("period", ["weekly", "monthly", "quarterly", "yearly"]).default("monthly").notNull(),
  weekOf: timestamp("weekOf"),  // for weekly KPIs
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── KPI History ──────────────────────────────────────────────────────────────
export const kpiHistory = mysqlTable("kpiHistory", {
  id: int("id").autoincrement().primaryKey(),
  kpiId: int("kpiId").notNull(),
  value: decimal("value", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  recordedBy: int("recordedBy").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});
// ─── Safety Topics (posted by management for foreman) ────────────────────────────────────────────────────────
export const safetyTopics = mysqlTable("safetyTopics", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  category: varchar("category", { length: 64 }).default("general"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Safety Meetings (documented by foreman) ──────────────────────────────────────────────────────────
export const safetyMeetings = mysqlTable("safetyMeetings", {
  id: int("id").autoincrement().primaryKey(),
  topicId: int("topicId"),
  jobId: int("jobId").notNull(),
  meetingType: mysqlEnum("meetingType", ["safety_toolbox", "daily_goals"]).default("safety_toolbox").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  attendees: text("attendees"), // JSON array of employee names/IDs
  attendeeCount: int("attendeeCount").default(0),
  photoUrl: text("photoUrl"),
  conductedBy: int("conductedBy").notNull(),
  conductedAt: timestamp("conductedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
// ─── Pivot Memory (conversation history & preferences) ────────────────────────
export const pivotMemory = mysqlTable("pivotMemory", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  preferredLanguage: varchar("preferredLanguage", { length: 10 }).default("en").notNull(),
  conversationSummary: text("conversationSummary"), // AI-generated summary of past conversations
  preferences: text("preferences"), // JSON: topics of interest, communication style, patterns
  ownerPatterns: text("ownerPatterns"), // JSON: owner-only decision patterns Pivot has learned
  personalProfile: text("personalProfile"), // JSON: personal interests, family, hobbies, life details Pivot has learned
  communicationStyle: text("communicationStyle"), // JSON: how this person communicates, humor, formality, topics they care about
  growthLog: text("growthLog"), // JSON: milestones in Pivot's relationship with this employee
  interactionCount: int("interactionCount").default(0).notNull(),
  lastInteraction: timestamp("lastInteraction").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const pivotConversations = mysqlTable("pivotConversations", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  role: varchar("role", { length: 20 }).notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});


// Time Adjustments (audit log for clock entry edits)
export const timeAdjustments = mysqlTable("timeAdjustments", {
  id: int("id").autoincrement().primaryKey(),
  clockEntryId: int("clockEntryId").notNull(),
  adjustedBy: int("adjustedBy").notNull(),
  fieldChanged: varchar("fieldChanged", { length: 32 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Punch List Items ──────────────────────────────────────────────────────────
export const punchListItems = mysqlTable("punch_list_items", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  area: varchar("area", { length: 128 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "completed"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  assignedTo: int("assignedTo"),
  completedBy: int("completedBy"),
  completedAt: timestamp("completedAt"),
  createdBy: int("createdBy").notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Types ───────────────────────────────────────────────────────────────────────
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

export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = typeof meetings.$inferInsert;

export type WeeklyGoal = typeof weeklyGoals.$inferSelect;
export type InsertWeeklyGoal = typeof weeklyGoals.$inferInsert;

export type QbEstimate = typeof qbEstimates.$inferSelect;
export type InsertQbEstimate = typeof qbEstimates.$inferInsert;

export type KpiMetric = typeof kpiMetrics.$inferSelect;
export type InsertKpiMetric = typeof kpiMetrics.$inferInsert;

export type KpiHistory = typeof kpiHistory.$inferSelect;
export type InsertKpiHistory = typeof kpiHistory.$inferInsert;

export type SafetyTopic = typeof safetyTopics.$inferSelect;
export type InsertSafetyTopic = typeof safetyTopics.$inferInsert;

export type SafetyMeeting = typeof safetyMeetings.$inferSelect;
export type InsertSafetyMeeting = typeof safetyMeetings.$inferInsert;

export type PivotMemory = typeof pivotMemory.$inferSelect;
export type InsertPivotMemory = typeof pivotMemory.$inferInsert;

export type PivotConversation = typeof pivotConversations.$inferSelect;
export type InsertPivotConversation = typeof pivotConversations.$inferInsert;

export type TimeAdjustment = typeof timeAdjustments.$inferSelect;
export type InsertTimeAdjustment = typeof timeAdjustments.$inferInsert;

export type PunchListItem = typeof punchListItems.$inferSelect;
export type InsertPunchListItem = typeof punchListItems.$inferInsert;
