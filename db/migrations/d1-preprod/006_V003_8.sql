CREATE TABLE `uploaded_files` (
	`id` text(21) PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`request_id` text(21) NOT NULL,
	`path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`uploaded_at` integer,
	`attached_at` integer,
	`original_name` text,
	`checksum` blob
);

CREATE INDEX `idx_uploaded_files_request_id` ON `uploaded_files` (`user_id`,`request_id`);