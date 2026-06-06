CREATE TABLE `media_enrichment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`media_id` varchar(128) NOT NULL,
	`imdb_id` varchar(32) NOT NULL DEFAULT '',
	`trakt_slug` varchar(255) NOT NULL DEFAULT '',
	`trakt_rating` float,
	`trakt_votes` int,
	`audience_score` int,
	`critic_score` int,
	`similar_ids` json NOT NULL DEFAULT ('[]'),
	`trakt_meta` json,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	CONSTRAINT `media_enrichment_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_enrichment_media_id_unique` UNIQUE(`media_id`)
);
--> statement-breakpoint
CREATE TABLE `taste_profile` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profile_id` varchar(64) NOT NULL DEFAULT 'default',
	`dimension` varchar(32) NOT NULL,
	`value` varchar(255) NOT NULL,
	`score` float NOT NULL DEFAULT 0,
	`event_count` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taste_profile_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taste_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profile_id` varchar(64) NOT NULL DEFAULT 'default',
	`media_id` varchar(128) NOT NULL,
	`media_title` varchar(512) NOT NULL DEFAULT '',
	`score` float NOT NULL DEFAULT 0,
	`watched` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taste_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watch_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profile_id` varchar(64) NOT NULL DEFAULT 'default',
	`media_id` varchar(128) NOT NULL,
	`media_title` varchar(512) NOT NULL DEFAULT '',
	`media_type` varchar(16) NOT NULL DEFAULT 'movie',
	`genres` json NOT NULL DEFAULT ('[]'),
	`director` varchar(255) NOT NULL DEFAULT '',
	`actors` text NOT NULL DEFAULT (''),
	`year` varchar(8) NOT NULL DEFAULT '',
	`imdb_rating` varchar(8) NOT NULL DEFAULT '',
	`event_type` varchar(32) NOT NULL,
	`progress_pct` float NOT NULL DEFAULT 0,
	`watched_secs` int NOT NULL DEFAULT 0,
	`duration_secs` int NOT NULL DEFAULT 0,
	`user_rating` float,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watch_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_me_imdb` ON `media_enrichment` (`imdb_id`);--> statement-breakpoint
CREATE INDEX `idx_me_expires` ON `media_enrichment` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_tp_profile_dim` ON `taste_profile` (`profile_id`,`dimension`);--> statement-breakpoint
CREATE INDEX `idx_tp_score` ON `taste_profile` (`score`);--> statement-breakpoint
CREATE INDEX `idx_ts_profile_score` ON `taste_scores` (`profile_id`,`score`);--> statement-breakpoint
CREATE INDEX `idx_ts_media` ON `taste_scores` (`media_id`);--> statement-breakpoint
CREATE INDEX `idx_we_profile` ON `watch_events` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_we_media` ON `watch_events` (`media_id`);--> statement-breakpoint
CREATE INDEX `idx_we_event` ON `watch_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_we_created` ON `watch_events` (`created_at`);