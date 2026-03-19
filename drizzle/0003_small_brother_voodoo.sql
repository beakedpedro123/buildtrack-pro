CREATE TABLE `kpiHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kpiId` int NOT NULL,
	`value` decimal(12,2) NOT NULL,
	`notes` text,
	`recordedBy` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kpiHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpiMetrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`category` enum('revenue','labor','jobs','safety','schedule','custom') NOT NULL DEFAULT 'custom',
	`unit` varchar(32) DEFAULT '',
	`targetValue` decimal(12,2),
	`currentValue` decimal(12,2) DEFAULT '0',
	`description` text,
	`period` enum('weekly','monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
	`weekOf` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpiMetrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qbEstimates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`qbEstimateId` varchar(64),
	`qbEstimateNumber` varchar(64),
	`clientName` varchar(128),
	`totalAmount` decimal(12,2) NOT NULL,
	`status` varchar(32) DEFAULT 'pending',
	`lineItems` text,
	`issueDate` timestamp,
	`expiryDate` timestamp,
	`notes` text,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qbEstimates_id` PRIMARY KEY(`id`)
);
