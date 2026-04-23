CREATE TABLE `company_overhead` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`monthlyAmount` decimal(10,2) NOT NULL,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_overhead_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_tax_info` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`ssn` varchar(11),
	`filingStatus` enum('single','married_filing_jointly','married_filing_separately','head_of_household'),
	`federalAllowances` int DEFAULT 0,
	`stateAllowances` int DEFAULT 0,
	`additionalWithholding` decimal(8,2) DEFAULT '0',
	`w4Year` int,
	`i9Verified` boolean DEFAULT false,
	`notes` text,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_tax_info_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_schedule` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`scheduledDate` timestamp NOT NULL,
	`endDate` timestamp,
	`status` enum('pending','in_progress','completed','skipped') NOT NULL DEFAULT 'pending',
	`assignedEmployees` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_schedule_id` PRIMARY KEY(`id`)
);
