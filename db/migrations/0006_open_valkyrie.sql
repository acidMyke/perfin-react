CREATE TABLE `login_attempts` (
	`id` text(16) PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`attempted_for_id` text(8) NOT NULL,
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
ALTER TABLE `sessions` ADD `login_in_attempt_id` text(8) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `released_after` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `email` text NOT NULL;