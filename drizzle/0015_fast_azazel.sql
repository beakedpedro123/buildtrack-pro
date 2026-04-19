ALTER TABLE `jobs` ADD `billingType` enum('fixed','hourly') DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `hourlyRate` decimal(8,2) DEFAULT '55';