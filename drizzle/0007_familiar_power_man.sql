CREATE TABLE `pivotConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`role` varchar(20) NOT NULL,
	`content` text NOT NULL,
	`language` varchar(10) NOT NULL DEFAULT 'en',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pivotConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pivotMemory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`preferredLanguage` varchar(10) NOT NULL DEFAULT 'en',
	`conversationSummary` text,
	`preferences` text,
	`ownerPatterns` text,
	`interactionCount` int NOT NULL DEFAULT 0,
	`lastInteraction` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pivotMemory_id` PRIMARY KEY(`id`)
);
