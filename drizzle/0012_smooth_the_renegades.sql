ALTER TABLE `employees` ADD `payType` enum('hourly','salary') DEFAULT 'hourly' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `salaryAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `employees` ADD `salaryProjects` text;