CREATE TABLE `badge_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text NOT NULL,
	`category` enum('distance','session','consistency','open_water','special','milestone') NOT NULL,
	`iconName` varchar(64) NOT NULL,
	`colorPrimary` varchar(16) DEFAULT '#1e3a5f',
	`colorSecondary` varchar(16) DEFAULT '#3b82f6',
	`requirementType` varchar(64) NOT NULL,
	`requirementValue` int NOT NULL,
	`requirementExtra` json,
	`xpReward` int NOT NULL DEFAULT 100,
	`rarity` enum('common','uncommon','rare','epic','legendary') NOT NULL DEFAULT 'common',
	`soundEffect` varchar(64) DEFAULT 'badge_unlock',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `badge_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `badge_definitions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `level_thresholds` (
	`level` int NOT NULL,
	`xpRequired` int NOT NULL,
	`title` varchar(64) NOT NULL,
	`color` varchar(16) DEFAULT '#3b82f6',
	CONSTRAINT `level_thresholds_level` PRIMARY KEY(`level`)
);
--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`recordType` varchar(64) NOT NULL,
	`value` int NOT NULL,
	`strokeType` enum('freestyle','backstroke','breaststroke','butterfly','mixed'),
	`activityId` int,
	`achievedAt` timestamp NOT NULL DEFAULT (now()),
	`previousValue` int,
	CONSTRAINT `personal_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `swimmer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`avatarUrl` text,
	`level` int NOT NULL DEFAULT 1,
	`totalXp` int NOT NULL DEFAULT 0,
	`currentLevelXp` int NOT NULL DEFAULT 0,
	`totalDistanceMeters` int NOT NULL DEFAULT 0,
	`totalTimeSeconds` int NOT NULL DEFAULT 0,
	`totalSessions` int NOT NULL DEFAULT 0,
	`totalOpenWaterSessions` int NOT NULL DEFAULT 0,
	`totalOpenWaterMeters` int NOT NULL DEFAULT 0,
	`garminConnected` boolean NOT NULL DEFAULT false,
	`garminTokenEncrypted` text,
	`garminLastSync` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `swimmer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `swimmer_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `swimming_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`garminActivityId` varchar(64),
	`activityDate` timestamp NOT NULL,
	`distanceMeters` int NOT NULL,
	`durationSeconds` int NOT NULL,
	`poolLengthMeters` int DEFAULT 25,
	`strokeType` enum('freestyle','backstroke','breaststroke','butterfly','mixed') DEFAULT 'mixed',
	`avgPacePer100m` int,
	`calories` int,
	`avgHeartRate` int,
	`maxHeartRate` int,
	`swolfScore` int,
	`lapsCount` int,
	`isOpenWater` boolean NOT NULL DEFAULT false,
	`hrZone1Seconds` int,
	`hrZone2Seconds` int,
	`hrZone3Seconds` int,
	`hrZone4Seconds` int,
	`hrZone5Seconds` int,
	`location` text,
	`xpEarned` int NOT NULL DEFAULT 0,
	`notes` text,
	`rawData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `swimming_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`badgeId` int NOT NULL,
	`earnedAt` timestamp NOT NULL DEFAULT (now()),
	`activityId` int,
	CONSTRAINT `user_badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`weekStart` timestamp NOT NULL,
	`sessionsCount` int NOT NULL DEFAULT 0,
	`totalDistanceMeters` int NOT NULL DEFAULT 0,
	`totalTimeSeconds` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `xp_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`reason` enum('activity','badge','bonus','streak','record','level_up') NOT NULL,
	`referenceId` int,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `xp_transactions_id` PRIMARY KEY(`id`)
);
