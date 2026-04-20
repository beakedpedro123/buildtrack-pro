CREATE TABLE `budget_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`employeeId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`previousValue` decimal(12,2),
	`newValue` decimal(12,2),
	`description` text,
	`changeOrderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_audit_log_id` PRIMARY KEY(`id`)
);
