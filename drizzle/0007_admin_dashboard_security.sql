CREATE TABLE `adminSettings` (
	`settingKey` varchar(128) NOT NULL,
	`settingValue` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `adminSettings_settingKey` PRIMARY KEY(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `adminAuditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(96) NOT NULL,
	`result` enum('success','failure','denied') NOT NULL,
	`adminKeyId` varchar(64),
	`adminName` varchar(128),
	`ipAddress` varchar(64),
	`userAgent` text,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminAuditLog_id` PRIMARY KEY(`id`)
);
