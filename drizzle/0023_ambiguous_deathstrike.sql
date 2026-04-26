CREATE TABLE `knowledge_base` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`category` enum('getting_started','features','troubleshooting','billing','faq') NOT NULL DEFAULT 'faq',
	`content` text NOT NULL,
	`tags` text,
	`viewCount` int NOT NULL DEFAULT 0,
	`helpfulCount` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_base_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pivot_support_learning` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int,
	`problem` text NOT NULL,
	`solution` text NOT NULL,
	`category` varchar(64),
	`confidence` float DEFAULT 0.5,
	`timesUsed` int NOT NULL DEFAULT 0,
	`timesHelpful` int NOT NULL DEFAULT 0,
	`learnedFrom` enum('ticket_resolution','manual_entry','kb_article') NOT NULL DEFAULT 'ticket_resolution',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pivot_support_learning_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_ticket_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`authorType` enum('customer','agent','pivot_ai') NOT NULL,
	`authorName` varchar(128),
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_ticket_replies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int,
	`customerName` varchar(128),
	`customerEmail` varchar(320),
	`subject` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category` enum('bug','feature_request','billing','how_to','account','other') NOT NULL DEFAULT 'other',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_progress','waiting_customer','resolved','closed') NOT NULL DEFAULT 'open',
	`assignedTo` int,
	`pivotSuggestion` text,
	`resolution` text,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
