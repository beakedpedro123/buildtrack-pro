ALTER TABLE `dailyReports` ADD `seenByOwner` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dailyReports` ADD `seenAt` timestamp;