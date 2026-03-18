CREATE TABLE `meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`scheduledFor` timestamp,
	`startedAt` timestamp,
	`endedAt` timestamp,
	`status` enum('scheduled','recording','processing','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`audioUrl` text,
	`transcript` text,
	`summary` text,
	`attendees` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meetings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weeklyGoals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`assignedTo` int,
	`weekOf` timestamp NOT NULL,
	`status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`createdBy` int NOT NULL,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weeklyGoals_id` PRIMARY KEY(`id`)
);
