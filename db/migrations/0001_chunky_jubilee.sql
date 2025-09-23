CREATE TABLE `histories` (
	`id` text(16) PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text(8) NOT NULL,
	`values_were` text NOT NULL,
	`version_was` integer NOT NULL,
	`was_updated_at` integer NOT NULL,
	`was_updated_by` text(8),
	FOREIGN KEY (`was_updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `updated_by` text(8) NOT NULL REFERENCES users(id);