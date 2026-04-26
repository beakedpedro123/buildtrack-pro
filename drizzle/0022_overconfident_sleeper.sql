CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`ownerEmail` varchar(320),
	`ownerPhone` varchar(20),
	`logoUrl` text,
	`plan` enum('trial','starter','professional','enterprise') NOT NULL DEFAULT 'trial',
	`stripeCustomerId` varchar(128),
	`stripeSubscriptionId` varchar(128),
	`trialStartDate` timestamp NOT NULL DEFAULT (now()),
	`trialEndDate` timestamp,
	`subscriptionStatus` enum('trialing','active','past_due','cancelled','expired') NOT NULL DEFAULT 'trialing',
	`maxEmployees` int DEFAULT 50,
	`maxJobs` int DEFAULT 20,
	`timezone` varchar(64) DEFAULT 'America/Denver',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `budget_audit_log` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `budgetCategories` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `change_orders` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `clockEntries` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `company_overhead` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `dailyReports` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_tax_info` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobAssignments` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_schedule` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `kpiHistory` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `kpiMetrics` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `materialEntries` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `message_recipients` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `pivotConversations` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `pivotMemory` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `punch_list_items` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `qbEstimates` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `qbSyncLog` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `reportPhotos` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `safetyMeetings` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `safetyTopics` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `timeAdjustments` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `companyId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `weeklyGoals` ADD `companyId` int DEFAULT 1 NOT NULL;