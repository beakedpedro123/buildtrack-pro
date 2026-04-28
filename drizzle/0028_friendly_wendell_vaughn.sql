ALTER TABLE `clockEntries` ADD `lunchMinutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `lunchAutoDeduct` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `lunchDeductMinutes` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `lunchMinShiftMinutes` int DEFAULT 360 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `lunchSkipDays` varchar(32) DEFAULT '5';