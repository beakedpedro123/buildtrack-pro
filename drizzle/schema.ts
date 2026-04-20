import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const employeeRoleEnum = pgEnum("employee_role", ["owner", "office_manager", "secretary", "logistics", "foreman", "laborer"]);
export const payTypeEnum = pgEnum("pay_type", ["hourly", "salary"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted"]);
export const jobStatusEnum = pgEnum("job_status", ["active", "paused", "completed", "cancelled"]);
export const jobAssignmentRoleEnum = pgEnum("job_assignment_role", ["foreman", "laborer"]);
export const billingTypeEnum = pgEnum("billing_type", ["fixed", "hourly"]);
export const syncTypeEnum = pgEnum("sync_type", ["expenses", "labor", "full"]);
export const syncStatusEnum = pgEnum("sync_status", ["pending", "success", "failed"]);
export const meetingStatusEnum = pgEnum("meeting_status", ["scheduled", "recording", "processing", "completed", "cancelled"]);
export const goalStatusEnum = pgEnum("goal_status", ["pending", "in_progress", "completed", "cancelled"]);
export const goalPriorityEnum = pgEnum("goal_priority", ["low", "medium", "high"]);
export const kpiCategoryEnum = pgEnum("kpi_category", ["revenue", "labor", "jobs", "safety", "schedule", "custom"]);
export const kpiPeriodEnum = pgEnum("kpi_period", ["weekly", "monthly", "quarterly", "yearly"]);
export const meetingTypeEnum = pgEnum("meeting_type_enum", ["safety_toolbox", "daily_goals"]);
export const punchListStatusEnum = pgEnum("punch_list_status", ["pending", "completed"]);
export const punchListPriorityEnum = pgEnum("punch_list_priority", ["low", "medium", "high"]);
export const messageTypeEnum = pgEnum("message_type", ["note", "message", "alert", "plan_set"]);
export const messagePriorityEnum = pgEnum("message_priority", ["normal", "urgent"]);
export const attachmentTypeEnum = pgEnum("attachment_type", ["image", "pdf", "document"]);
export const changeOrderTypeEnum = pgEnum("change_order_type", ["add", "deduct"]);
export const changeOrderStatusEnum = pgEnum("change_order_status", ["pending", "approved", "rejected"]);

// ─── Users (Manus OAuth) ───────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── Employees ─────────────────────────────────────────────────────────────
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  role: employeeRoleEnum("role").default("laborer").notNull(),
  pin: varchar("pin", { length: 64 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  isActive: boolean("isActive").default(true).notNull(),
  hourlyRate: numeric("hourlyRate", { precision: 8, scale: 2 }),
  payType: payTypeEnum("payType").default("hourly").notNull(),
  salaryAmount: numeric("salaryAmount", { precision: 12, scale: 2 }),
  salaryProjects: text("salaryProjects"),
  inviteToken: varchar("inviteToken", { length: 64 }),
  inviteStatus: inviteStatusEnum("inviteStatus").default("accepted"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Jobs / Jobsites ───────────────────────────────────────────────────────
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  clientName: varchar("clientName", { length: 128 }),
  clientPhone: varchar("clientPhone", { length: 20 }),
  status: jobStatusEnum("status").default("active").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  billingType: billingTypeEnum("billingType").default("fixed").notNull(),
  hourlyRate: numeric("hourlyRate", { precision: 8, scale: 2 }).default("55"),
  totalBudget: numeric("totalBudget", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  taxRate: numeric("taxRate", { precision: 5, scale: 2 }).default("0"),
  workersCompRate: numeric("workersCompRate", { precision: 5, scale: 2 }).default("0"),
  liabilityInsRate: numeric("liabilityInsRate", { precision: 5, scale: 2 }).default("0"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Job Assignments ───────────────────────────────────────────────────────
export const jobAssignments = pgTable("jobAssignments", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  employeeId: integer("employeeId").notNull(),
  role: jobAssignmentRoleEnum("role").default("laborer").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
});

// ─── Clock Entries ─────────────────────────────────────────────────────────
export const clockEntries = pgTable("clockEntries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull(),
  jobId: integer("jobId").notNull(),
  clockIn: timestamp("clockIn").notNull(),
  clockOut: timestamp("clockOut"),
  clockInLatitude: real("clockInLatitude"),
  clockInLongitude: real("clockInLongitude"),
  clockOutLatitude: real("clockOutLatitude"),
  clockOutLongitude: real("clockOutLongitude"),
  isOfflineEntry: boolean("isOfflineEntry").default(false).notNull(),
  localId: varchar("localId", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Daily Reports ─────────────────────────────────────────────────────────
export const dailyReports = pgTable("dailyReports", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  submittedBy: integer("submittedBy").notNull(),
  reportDate: timestamp("reportDate").notNull(),
  workCompleted: text("workCompleted"),
  notes: text("notes"),
  weatherCondition: varchar("weatherCondition", { length: 64 }),
  crewCount: integer("crewCount").default(0),
  seenByOwner: boolean("seenByOwner").default(false).notNull(),
  seenAt: timestamp("seenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Materials Used ────────────────────────────────────────────────────────
export const materialEntries = pgTable("materialEntries", {
  id: serial("id").primaryKey(),
  reportId: integer("reportId").notNull(),
  jobId: integer("jobId").notNull(),
  materialName: varchar("materialName", { length: 255 }).notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("units"),
  unitCost: numeric("unitCost", { precision: 10, scale: 2 }),
  totalCost: numeric("totalCost", { precision: 12, scale: 2 }),
  supplier: varchar("supplier", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Report Photos ─────────────────────────────────────────────────────────
export const reportPhotos = pgTable("reportPhotos", {
  id: serial("id").primaryKey(),
  reportId: integer("reportId").notNull(),
  jobId: integer("jobId").notNull(),
  uploadedBy: integer("uploadedBy").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  caption: text("caption"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Budget Categories ─────────────────────────────────────────────────────
export const budgetCategories = pgTable("budgetCategories", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  budgetedAmount: numeric("budgetedAmount", { precision: 12, scale: 2 }).notNull(),
  spentAmount: numeric("spentAmount", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Expenses ──────────────────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  categoryId: integer("categoryId"),
  description: varchar("description", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: timestamp("expenseDate").notNull(),
  receiptUrl: text("receiptUrl"),
  submittedBy: integer("submittedBy").notNull(),
  qbSynced: boolean("qbSynced").default(false).notNull(),
  qbSyncedAt: timestamp("qbSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── QuickBooks Sync Log ───────────────────────────────────────────────────
export const qbSyncLog = pgTable("qbSyncLog", {
  id: serial("id").primaryKey(),
  syncType: syncTypeEnum("syncType").notNull(),
  status: syncStatusEnum("status").default("pending").notNull(),
  itemsSynced: integer("itemsSynced").default(0),
  errorMessage: text("errorMessage"),
  triggeredBy: integer("triggeredBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// ─── Meetings ─────────────────────────────────────────────────────────────
export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  scheduledFor: timestamp("scheduledFor"),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  status: meetingStatusEnum("status").default("scheduled").notNull(),
  audioUrl: text("audioUrl"),
  transcript: text("transcript"),
  summary: text("summary"),
  attendees: text("attendees"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Weekly Goals ──────────────────────────────────────────────────────────
export const weeklyGoals = pgTable("weeklyGoals", {
  id: serial("id").primaryKey(),
  meetingId: integer("meetingId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignedTo: integer("assignedTo"),
  assignedToList: varchar("assignedToList", { length: 255 }),
  weekOf: timestamp("weekOf").notNull(),
  status: goalStatusEnum("status").default("pending").notNull(),
  priority: goalPriorityEnum("priority").default("medium").notNull(),
  deadline: timestamp("deadline"),
  createdBy: integer("createdBy").notNull(),
  completedAt: timestamp("completedAt"),
  repeatDaily: boolean("repeatDaily").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── QuickBooks Estimates ────────────────────────────────────────────────────
export const qbEstimates = pgTable("qbEstimates", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  qbEstimateId: varchar("qbEstimateId", { length: 64 }),
  qbEstimateNumber: varchar("qbEstimateNumber", { length: 64 }),
  clientName: varchar("clientName", { length: 128 }),
  totalAmount: numeric("totalAmount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 32 }).default("pending"),
  lineItems: text("lineItems"),
  issueDate: timestamp("issueDate"),
  expiryDate: timestamp("expiryDate"),
  notes: text("notes"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── KPI Metrics ──────────────────────────────────────────────────────────────
export const kpiMetrics = pgTable("kpiMetrics", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  category: kpiCategoryEnum("category").default("custom").notNull(),
  unit: varchar("unit", { length: 32 }).default(""),
  targetValue: numeric("targetValue", { precision: 12, scale: 2 }),
  currentValue: numeric("currentValue", { precision: 12, scale: 2 }).default("0"),
  description: text("description"),
  period: kpiPeriodEnum("period").default("monthly").notNull(),
  weekOf: timestamp("weekOf"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: integer("createdBy").notNull(),
  updatedBy: integer("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── KPI History ──────────────────────────────────────────────────────────────
export const kpiHistory = pgTable("kpiHistory", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpiId").notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  recordedBy: integer("recordedBy").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

// ─── Safety Topics ────────────────────────────────────────────────────────────
export const safetyTopics = pgTable("safetyTopics", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  category: varchar("category", { length: 64 }).default("general"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Safety Meetings ──────────────────────────────────────────────────────────
export const safetyMeetings = pgTable("safetyMeetings", {
  id: serial("id").primaryKey(),
  topicId: integer("topicId"),
  jobId: integer("jobId").notNull(),
  meetingType: meetingTypeEnum("meetingType").default("safety_toolbox").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  attendees: text("attendees"),
  attendeeCount: integer("attendeeCount").default(0),
  photoUrl: text("photoUrl"),
  conductedBy: integer("conductedBy").notNull(),
  conductedAt: timestamp("conductedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Pivot Memory ────────────────────────────────────────────────────────────
export const pivotMemory = pgTable("pivotMemory", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull(),
  preferredLanguage: varchar("preferredLanguage", { length: 10 }).default("en").notNull(),
  conversationSummary: text("conversationSummary"),
  preferences: text("preferences"),
  ownerPatterns: text("ownerPatterns"),
  personalProfile: text("personalProfile"),
  communicationStyle: text("communicationStyle"),
  growthLog: text("growthLog"),
  interactionCount: integer("interactionCount").default(0).notNull(),
  lastInteraction: timestamp("lastInteraction").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const pivotConversations = pgTable("pivotConversations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Time Adjustments ────────────────────────────────────────────────────────
export const timeAdjustments = pgTable("timeAdjustments", {
  id: serial("id").primaryKey(),
  clockEntryId: integer("clockEntryId").notNull(),
  adjustedBy: integer("adjustedBy").notNull(),
  fieldChanged: varchar("fieldChanged", { length: 32 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Punch List Items ──────────────────────────────────────────────────────────
export const punchListItems = pgTable("punch_list_items", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  area: varchar("area", { length: 128 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: punchListStatusEnum("status").default("pending").notNull(),
  priority: punchListPriorityEnum("priority").default("medium").notNull(),
  assignedTo: integer("assignedTo"),
  completedBy: integer("completedBy"),
  completedAt: timestamp("completedAt"),
  createdBy: integer("createdBy").notNull(),
  sortOrder: integer("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Messages / Notes ──────────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("senderId").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  type: messageTypeEnum("type").default("message").notNull(),
  priority: messagePriorityEnum("priority").default("normal").notNull(),
  attachmentUrl: text("attachmentUrl"),
  attachmentType: attachmentTypeEnum("attachmentType"),
  attachmentName: varchar("attachmentName", { length: 255 }),
  isCompanyWide: boolean("isCompanyWide").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const messageRecipients = pgTable("message_recipients", {
  id: serial("id").primaryKey(),
  messageId: integer("messageId").notNull(),
  recipientId: integer("recipientId").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Change Orders ──────────────────────────────────────────────────────────
export const changeOrders = pgTable("change_orders", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  orderType: changeOrderTypeEnum("orderType").default("add").notNull(),
  status: changeOrderStatusEnum("status").default("approved").notNull(),
  createdBy: integer("createdBy").notNull(),
  approvedBy: integer("approvedBy"),
  orderDate: timestamp("orderDate").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Budget Audit Log ─────────────────────────────────────────────────────
export const budgetAuditLog = pgTable("budget_audit_log", {
  id: serial("id").primaryKey(),
  jobId: integer("jobId").notNull(),
  employeeId: integer("employeeId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  previousValue: numeric("previousValue", { precision: 12, scale: 2 }),
  newValue: numeric("newValue", { precision: 12, scale: 2 }),
  description: text("description"),
  changeOrderId: integer("changeOrderId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type MessageRecipient = typeof messageRecipients.$inferSelect;
export type InsertMessageRecipient = typeof messageRecipients.$inferInsert;

export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = typeof changeOrders.$inferInsert;

export type BudgetAuditLog = typeof budgetAuditLog.$inferSelect;
export type InsertBudgetAuditLog = typeof budgetAuditLog.$inferInsert;
