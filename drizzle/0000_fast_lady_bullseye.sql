CREATE TABLE `pipeline_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_key` text NOT NULL,
	`status` text NOT NULL,
	`source_updated_at` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_runs_run_key_unique` ON `pipeline_runs` (`run_key`);--> statement-breakpoint
CREATE TABLE `rank_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`universe` text NOT NULL,
	`rank` integer NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`change_raw` real,
	`signal_text` text DEFAULT '' NOT NULL,
	`metric_json` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_row_identity` ON `rank_rows` (`snapshot_id`,`universe`,`code`);--> statement-breakpoint
CREATE INDEX `rank_row_universe_rank` ON `rank_rows` (`snapshot_id`,`universe`,`rank`);--> statement-breakpoint
CREATE TABLE `source_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_kind` text NOT NULL,
	`source_key` text NOT NULL,
	`market_date` text NOT NULL,
	`source_url` text,
	`published_at` text,
	`payload_hash` text NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_snapshot_identity` ON `source_snapshots` (`source_kind`,`source_key`);--> statement-breakpoint
CREATE INDEX `source_snapshot_market_date` ON `source_snapshots` (`market_date`);