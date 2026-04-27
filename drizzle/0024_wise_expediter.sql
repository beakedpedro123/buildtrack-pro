CREATE TABLE `trade_benchmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradeSlug` varchar(64) NOT NULL,
	`metricName` varchar(128) NOT NULL,
	`metricValue` float NOT NULL,
	`unit` varchar(32),
	`sampleSize` int NOT NULL DEFAULT 0,
	`region` varchar(64) DEFAULT 'national',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trade_benchmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_knowledge` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradeSlug` varchar(64) NOT NULL,
	`category` enum('scheduling','safety','terminology','cost_benchmarks','best_practices','common_tasks','equipment','materials','productivity_tips','quality_checks') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`source` enum('system','aggregated','admin') NOT NULL DEFAULT 'system',
	`aggregatedFromCount` int DEFAULT 0,
	`confidenceScore` float DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trade_knowledge_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `trades` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `primaryTrade` varchar(64);