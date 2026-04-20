CREATE TABLE `timeAdjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clockEntryId` int NOT NULL,
	`adjustedBy` int NOT NULL,
	`fieldChanged` varchar(32) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `timeAdjustments_id` PRIMARY KEY(`id`)
);
