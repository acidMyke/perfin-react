-- Migration number: 0002 	 2025-12-24T05:58:06.248Z
CREATE TABLE `search` (
	`chunk` text NOT NULL,
	`text` text NOT NULL,
	`type` text NOT NULL,
	`user_id` text(21) NOT NULL,
	`usage_count` integer DEFAULT 1,
	`context` text DEFAULT '' NOT NULL,
	CONSTRAINT `search_pk` PRIMARY KEY(`chunk`, `text`, `type`, `user_id`, `context`)
);
--> statement-breakpoint
CREATE INDEX `idx_search_chunk` ON `search` (`user_id`,`type`,`chunk`);