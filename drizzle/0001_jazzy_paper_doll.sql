CREATE TABLE `refresh_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`requested_snapshot_date` text,
	`result_trade_date` text,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `idx_refresh_requests_status_requested_at` ON `refresh_requests` (`status`,`requested_at`);