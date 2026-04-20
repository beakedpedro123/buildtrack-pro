ALTER TABLE `employees` ADD `inviteToken` varchar(64);--> statement-breakpoint
ALTER TABLE `employees` ADD `inviteStatus` enum('pending','accepted') DEFAULT 'accepted';