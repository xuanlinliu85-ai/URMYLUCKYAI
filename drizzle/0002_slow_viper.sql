CREATE TABLE `macro_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`indicator_id` text NOT NULL,
	`observation_date` text NOT NULL,
	`release_date` text,
	`fetched_at` text NOT NULL,
	`value` real,
	`frequency` text NOT NULL,
	`source` text NOT NULL,
	`source_field` text NOT NULL,
	`version_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `macro_observation_vintage` ON `macro_observations` (`indicator_id`,`observation_date`,`release_date`);--> statement-breakpoint
CREATE INDEX `macro_observation_series` ON `macro_observations` (`indicator_id`,`observation_date`);--> statement-breakpoint
CREATE INDEX `macro_observation_fetched` ON `macro_observations` (`fetched_at`);