CREATE TABLE `expense_attachments` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expense_id` text(21) NOT NULL,
	`upload_request_id` text(21) NOT NULL,
	`type` text NOT NULL,
	`sequence` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `file_requests` ADD `put_state` text;