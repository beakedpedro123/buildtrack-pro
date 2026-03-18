CREATE TABLE `budgetCategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`budgetedAmount` decimal(12,2) NOT NULL,
	`spentAmount` decimal(12,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budgetCategories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clockEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`jobId` int NOT NULL,
	`clockIn` timestamp NOT NULL,
	`clockOut` timestamp,
	`clockInLatitude` float,
	`clockInLongitude` float,
	`clockOutLatitude` float,
	`clockOutLongitude` float,
	`isOfflineEntry` boolean NOT NULL DEFAULT false,
	`localId` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clockEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`submittedBy` int NOT NULL,
	`reportDate` timestamp NOT NULL,
	`workCompleted` text,
	`notes` text,
	`weatherCondition` varchar(64),
	`crewCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`role` enum('owner','secretary','logistics','foreman','laborer') NOT NULL DEFAULT 'laborer',
	`pin` varchar(64) NOT NULL,
	`phone` varchar(20),
	`email` varchar(320),
	`isActive` boolean NOT NULL DEFAULT true,
	`hourlyRate` decimal(8,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`categoryId` int,
	`description` varchar(255) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`expenseDate` timestamp NOT NULL,
	`receiptUrl` text,
	`submittedBy` int NOT NULL,
	`qbSynced` boolean NOT NULL DEFAULT false,
	`qbSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`employeeId` int NOT NULL,
	`role` enum('foreman','laborer') NOT NULL DEFAULT 'laborer',
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `jobAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`clientName` varchar(128),
	`clientPhone` varchar(20),
	`status` enum('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
	`startDate` timestamp,
	`endDate` timestamp,
	`totalBudget` decimal(12,2) DEFAULT '0',
	`notes` text,
	`latitude` float,
	`longitude` float,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `materialEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`jobId` int NOT NULL,
	`materialName` varchar(255) NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unit` varchar(32) DEFAULT 'units',
	`unitCost` decimal(10,2),
	`totalCost` decimal(12,2),
	`supplier` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `materialEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qbSyncLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncType` enum('expenses','labor','full') NOT NULL,
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`itemsSynced` int DEFAULT 0,
	`errorMessage` text,
	`triggeredBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `qbSyncLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reportPhotos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`jobId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`url` text NOT NULL,
	`thumbnailUrl` text,
	`caption` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reportPhotos_id` PRIMARY KEY(`id`)
);
