CREATE TABLE `garmin_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`garminEmail` varchar(320),
	`oauth1Token` text,
	`oauth2Token` text,
	`tokenExpiresAt` timestamp,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `garmin_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `garmin_tokens_userId_unique` UNIQUE(`userId`)
);
