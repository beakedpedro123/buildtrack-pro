CREATE TABLE `safetyMeetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topicId` int,
	`jobId` int NOT NULL,
	`meetingType` enum('safety_toolbox','daily_goals') NOT NULL DEFAULT 'safety_toolbox',
	`title` varchar(255) NOT NULL,
	`notes` text,
	`attendees` text,
	`attendeeCount` int DEFAULT 0,
	`photoUrl` text,
	`conductedBy` int NOT NULL,
	`conductedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `safetyMeetings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `safetyTopics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`category` varchar(64) DEFAULT 'general',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `safetyTopics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `weeklyGoals` ADD `deadline` timestamp;