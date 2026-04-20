CREATE TYPE "public"."attachment_type" AS ENUM('image', 'pdf', 'document');--> statement-breakpoint
CREATE TYPE "public"."billing_type" AS ENUM('fixed', 'hourly');--> statement-breakpoint
CREATE TYPE "public"."change_order_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."change_order_type" AS ENUM('add', 'deduct');--> statement-breakpoint
CREATE TYPE "public"."employee_role" AS ENUM('owner', 'office_manager', 'secretary', 'logistics', 'foreman', 'laborer');--> statement-breakpoint
CREATE TYPE "public"."goal_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."job_assignment_role" AS ENUM('foreman', 'laborer');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."kpi_category" AS ENUM('revenue', 'labor', 'jobs', 'safety', 'schedule', 'custom');--> statement-breakpoint
CREATE TYPE "public"."kpi_period" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'recording', 'processing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_type_enum" AS ENUM('safety_toolbox', 'daily_goals');--> statement-breakpoint
CREATE TYPE "public"."message_priority" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('note', 'message', 'alert', 'plan_set');--> statement-breakpoint
CREATE TYPE "public"."pay_type" AS ENUM('hourly', 'salary');--> statement-breakpoint
CREATE TYPE "public"."punch_list_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."punch_list_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_type" AS ENUM('expenses', 'labor', 'full');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "budget_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"previousValue" numeric(12, 2),
	"newValue" numeric(12, 2),
	"description" text,
	"changeOrderId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgetCategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"budgetedAmount" numeric(12, 2) NOT NULL,
	"spentAmount" numeric(12, 2) DEFAULT '0',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"orderType" "change_order_type" DEFAULT 'add' NOT NULL,
	"status" "change_order_status" DEFAULT 'approved' NOT NULL,
	"createdBy" integer NOT NULL,
	"approvedBy" integer,
	"orderDate" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clockEntries" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"jobId" integer NOT NULL,
	"clockIn" timestamp NOT NULL,
	"clockOut" timestamp,
	"clockInLatitude" real,
	"clockInLongitude" real,
	"clockOutLatitude" real,
	"clockOutLongitude" real,
	"isOfflineEntry" boolean DEFAULT false NOT NULL,
	"localId" varchar(64),
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dailyReports" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"submittedBy" integer NOT NULL,
	"reportDate" timestamp NOT NULL,
	"workCompleted" text,
	"notes" text,
	"weatherCondition" varchar(64),
	"crewCount" integer DEFAULT 0,
	"seenByOwner" boolean DEFAULT false NOT NULL,
	"seenAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"role" "employee_role" DEFAULT 'laborer' NOT NULL,
	"pin" varchar(64) NOT NULL,
	"phone" varchar(20),
	"email" varchar(320),
	"isActive" boolean DEFAULT true NOT NULL,
	"hourlyRate" numeric(8, 2),
	"payType" "pay_type" DEFAULT 'hourly' NOT NULL,
	"salaryAmount" numeric(12, 2),
	"salaryProjects" text,
	"inviteToken" varchar(64),
	"inviteStatus" "invite_status" DEFAULT 'accepted',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"categoryId" integer,
	"description" varchar(255) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"expenseDate" timestamp NOT NULL,
	"receiptUrl" text,
	"submittedBy" integer NOT NULL,
	"qbSynced" boolean DEFAULT false NOT NULL,
	"qbSyncedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobAssignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"role" "job_assignment_role" DEFAULT 'laborer' NOT NULL,
	"assignedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"clientName" varchar(128),
	"clientPhone" varchar(20),
	"status" "job_status" DEFAULT 'active' NOT NULL,
	"startDate" timestamp,
	"endDate" timestamp,
	"billingType" "billing_type" DEFAULT 'fixed' NOT NULL,
	"hourlyRate" numeric(8, 2) DEFAULT '55',
	"totalBudget" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"latitude" real,
	"longitude" real,
	"taxRate" numeric(5, 2) DEFAULT '0',
	"workersCompRate" numeric(5, 2) DEFAULT '0',
	"liabilityInsRate" numeric(5, 2) DEFAULT '0',
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpiHistory" (
	"id" serial PRIMARY KEY NOT NULL,
	"kpiId" integer NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"notes" text,
	"recordedBy" integer NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpiMetrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"category" "kpi_category" DEFAULT 'custom' NOT NULL,
	"unit" varchar(32) DEFAULT '',
	"targetValue" numeric(12, 2),
	"currentValue" numeric(12, 2) DEFAULT '0',
	"description" text,
	"period" "kpi_period" DEFAULT 'monthly' NOT NULL,
	"weekOf" timestamp,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" integer NOT NULL,
	"updatedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materialEntries" (
	"id" serial PRIMARY KEY NOT NULL,
	"reportId" integer NOT NULL,
	"jobId" integer NOT NULL,
	"materialName" varchar(255) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" varchar(32) DEFAULT 'units',
	"unitCost" numeric(10, 2),
	"totalCost" numeric(12, 2),
	"supplier" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"scheduledFor" timestamp,
	"startedAt" timestamp,
	"endedAt" timestamp,
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"audioUrl" text,
	"transcript" text,
	"summary" text,
	"attendees" text,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"messageId" integer NOT NULL,
	"recipientId" integer NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"senderId" integer NOT NULL,
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"type" "message_type" DEFAULT 'message' NOT NULL,
	"priority" "message_priority" DEFAULT 'normal' NOT NULL,
	"attachmentUrl" text,
	"attachmentType" "attachment_type",
	"attachmentName" varchar(255),
	"isCompanyWide" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pivotConversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pivotMemory" (
	"id" serial PRIMARY KEY NOT NULL,
	"employeeId" integer NOT NULL,
	"preferredLanguage" varchar(10) DEFAULT 'en' NOT NULL,
	"conversationSummary" text,
	"preferences" text,
	"ownerPatterns" text,
	"personalProfile" text,
	"communicationStyle" text,
	"growthLog" text,
	"interactionCount" integer DEFAULT 0 NOT NULL,
	"lastInteraction" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "punch_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"area" varchar(128),
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" "punch_list_status" DEFAULT 'pending' NOT NULL,
	"priority" "punch_list_priority" DEFAULT 'medium' NOT NULL,
	"assignedTo" integer,
	"completedBy" integer,
	"completedAt" timestamp,
	"createdBy" integer NOT NULL,
	"sortOrder" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qbEstimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobId" integer NOT NULL,
	"qbEstimateId" varchar(64),
	"qbEstimateNumber" varchar(64),
	"clientName" varchar(128),
	"totalAmount" numeric(12, 2) NOT NULL,
	"status" varchar(32) DEFAULT 'pending',
	"lineItems" text,
	"issueDate" timestamp,
	"expiryDate" timestamp,
	"notes" text,
	"syncedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qbSyncLog" (
	"id" serial PRIMARY KEY NOT NULL,
	"syncType" "sync_type" NOT NULL,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"itemsSynced" integer DEFAULT 0,
	"errorMessage" text,
	"triggeredBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "reportPhotos" (
	"id" serial PRIMARY KEY NOT NULL,
	"reportId" integer NOT NULL,
	"jobId" integer NOT NULL,
	"uploadedBy" integer NOT NULL,
	"url" text NOT NULL,
	"thumbnailUrl" text,
	"caption" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safetyMeetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"topicId" integer,
	"jobId" integer NOT NULL,
	"meetingType" "meeting_type_enum" DEFAULT 'safety_toolbox' NOT NULL,
	"title" varchar(255) NOT NULL,
	"notes" text,
	"attendees" text,
	"attendeeCount" integer DEFAULT 0,
	"photoUrl" text,
	"conductedBy" integer NOT NULL,
	"conductedAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safetyTopics" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text,
	"category" varchar(64) DEFAULT 'general',
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeAdjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"clockEntryId" integer NOT NULL,
	"adjustedBy" integer NOT NULL,
	"fieldChanged" varchar(32) NOT NULL,
	"oldValue" text,
	"newValue" text,
	"reason" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "weeklyGoals" (
	"id" serial PRIMARY KEY NOT NULL,
	"meetingId" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"assignedTo" integer,
	"assignedToList" varchar(255),
	"weekOf" timestamp NOT NULL,
	"status" "goal_status" DEFAULT 'pending' NOT NULL,
	"priority" "goal_priority" DEFAULT 'medium' NOT NULL,
	"deadline" timestamp,
	"createdBy" integer NOT NULL,
	"completedAt" timestamp,
	"repeatDaily" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
