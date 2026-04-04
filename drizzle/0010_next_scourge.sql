CREATE TABLE `punch_list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`area` varchar(128),
	`title` varchar(500) NOT NULL,
	`description` text,
	`status` enum('pending','completed') NOT NULL DEFAULT 'pending',
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`assignedTo` int,
	`completedBy` int,
	`completedAt` timestamp,
	`createdBy` int NOT NULL,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `punch_list_items_id` PRIMARY KEY(`id`)
);
