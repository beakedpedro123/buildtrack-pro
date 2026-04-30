CREATE TABLE `admin_ip_allowlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ipAddress` varchar(64) NOT NULL,
	`label` varchar(128),
	`addedBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_ip_allowlist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `security_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`employeeId` int,
	`eventType` enum('login_failed','login_success','rate_limit_triggered','ownership_violation','admin_action','data_access_denied','account_lockout') NOT NULL,
	`ipAddress` varchar(64),
	`userAgent` varchar(512),
	`details` text,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_audit_log_id` PRIMARY KEY(`id`)
);
