ALTER TABLE `email_codes` RENAME COLUMN "email_code" TO "code";--> statement-breakpoint
ALTER TABLE `email_codes` RENAME COLUMN "request_type" TO "purpose";--> statement-breakpoint
ALTER TABLE `email_codes` DROP COLUMN `user_id`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`pass_salt` blob NOT NULL,
	`pass_digest` blob NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`released_after` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "version", "created_at", "updated_at", "name", "email", "pass_salt", "pass_digest", "failed_attempts", "released_after") SELECT "id", "version", "created_at", "updated_at", "name", "email", "pass_salt", "pass_digest", "failed_attempts", "released_after" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);