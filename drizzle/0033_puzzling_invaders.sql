CREATE TABLE `data_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`employeeId` int,
	`userId` int,
	`operation` enum('INSERT','UPDATE','DELETE') NOT NULL,
	`tableName` varchar(128) NOT NULL,
	`recordId` int,
	`previousData` json,
	`newData` json,
	`ipAddress` varchar(64),
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(255) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('processed','failed','skipped') NOT NULL DEFAULT 'processed',
	`details` text,
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`)
);
