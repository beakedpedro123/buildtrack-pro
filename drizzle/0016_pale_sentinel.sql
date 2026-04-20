CREATE TABLE `message_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`recipientId` int NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_recipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`type` enum('note','message','alert','plan_set') NOT NULL DEFAULT 'message',
	`priority` enum('normal','urgent') NOT NULL DEFAULT 'normal',
	`attachmentUrl` text,
	`attachmentType` enum('image','pdf','document'),
	`attachmentName` varchar(255),
	`isCompanyWide` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
