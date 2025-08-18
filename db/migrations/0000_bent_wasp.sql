CREATE TABLE `expenses` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`description` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`billed_at` integer NOT NULL,
	`belongs_to_id` text(8) NOT NULL,
	`account_id` text(8),
	`category_id` text(8),
	FOREIGN KEY (`belongs_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `ledger_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`credit_cents` integer DEFAULT 0 NOT NULL,
	`debit_cents` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`year` integer,
	`month` integer,
	`week` integer,
	`for_subject_id` text(8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`token` text(16) NOT NULL,
	`user_id` text(8) NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ledger_subjects` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`type` text NOT NULL,
	`belongs_to_id` text(8) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	FOREIGN KEY (`belongs_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text,
	`pass_salt` blob,
	`pass_key` blob,
	`require_new_password` integer DEFAULT true
);
