CREATE TABLE `change_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`description` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`orderType` enum('add','deduct') NOT NULL DEFAULT 'add',
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
	`createdBy` int NOT NULL,
	`approvedBy` int,
	`orderDate` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `change_orders_id` PRIMARY KEY(`id`)
);
