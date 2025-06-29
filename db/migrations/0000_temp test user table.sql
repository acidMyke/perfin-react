CREATE TABLE `users` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`name` text,
	`pass_salt` blob,
	`pass_key` blob,
	`require_new_password` integer DEFAULT true,
	`created_at` integer DEFAULT (current_timestamp),
	`update_at` integer DEFAULT (current_timestamp),
	`version` integer DEFAULT 1
);
