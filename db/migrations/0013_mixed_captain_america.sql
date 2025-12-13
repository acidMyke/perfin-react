CREATE TABLE `file_requests` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`session_id` text(21) NOT NULL,
	`method` text NOT NULL,
	`content_type` text,
	`file_path` text NOT NULL
);
