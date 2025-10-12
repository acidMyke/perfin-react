ALTER TABLE `sessions` RENAME COLUMN "login_in_attempt_id" TO "login_attempt_id";--> statement-breakpoint
CREATE TABLE `email_codes` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text NOT NULL,
	`email_code` text(16) NOT NULL,
	`request_type` text NOT NULL,
	`valid_until` integer NOT NULL,
	`user_id` text(8)
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text(8) NOT NULL,
	`public_key` blob,
	`sign_count` integer NOT NULL,
	`challenge` text,
	`challenged_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_login_attempts` (
	`id` text(16) PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`attempted_for_id` text(8),
	`is_success` integer NOT NULL,
	`ip` text NOT NULL,
	`asn` integer,
	`city` text,
	`region` text,
	`country` text(2),
	`colo` text(3),
	`user_agent` text,
	FOREIGN KEY (`attempted_for_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_login_attempts`("id", "timestamp", "attempted_for_id", "is_success", "ip", "asn", "city", "region", "country", "colo", "user_agent") SELECT "id", "timestamp", "attempted_for_id", "is_success", "ip", "asn", "city", "region", "country", "colo", "user_agent" FROM `login_attempts`;--> statement-breakpoint
DROP TABLE `login_attempts`;--> statement-breakpoint
ALTER TABLE `__new_login_attempts` RENAME TO `login_attempts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`pass_salt` blob,
	`pass_key` blob,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`released_after` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "version", "created_at", "updated_at", "name", "email", "pass_salt", "pass_key", "failed_attempts", "released_after") SELECT "id", "version", "created_at", "updated_at", "name", "email", "pass_salt", "pass_key", "failed_attempts", "released_after" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);