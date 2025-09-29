CREATE TABLE `accounts` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`belongs_to_id` text(8) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`belongs_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`belongs_to_id` text(8) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`belongs_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `ledgers`;--> statement-breakpoint
DROP TABLE `ledger_subjects`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expense_items` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sequence` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`expense_id` text(8) NOT NULL,
	`category_id` text(8),
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_expense_items`("id", "version", "created_at", "updated_at", "sequence", "name", "quantity", "price_cents", "expense_id", "category_id", "is_deleted") SELECT "id", "version", "created_at", "updated_at", "sequence", "name", "quantity", "price_cents", "expense_id", "category_id", "is_deleted" FROM `expense_items`;--> statement-breakpoint
DROP TABLE `expense_items`;--> statement-breakpoint
ALTER TABLE `__new_expense_items` RENAME TO `expense_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`billed_at` integer NOT NULL,
	`belongs_to_id` text(8) NOT NULL,
	`account_id` text(8),
	`category_id` text(8),
	`updated_by` text(8) NOT NULL,
	`latitude` real,
	`longitude` real,
	`geo_accuracy` real,
	`shop_name` text,
	`shop_mall` text,
	`is_deleted` integer DEFAULT false,
	FOREIGN KEY (`belongs_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "version", "created_at", "updated_at", "amount_cents", "billed_at", "belongs_to_id", "account_id", "category_id", "updated_by", "latitude", "longitude", "geo_accuracy", "shop_name", "shop_mall", "is_deleted") SELECT "id", "version", "created_at", "updated_at", "amount_cents", "billed_at", "belongs_to_id", "account_id", "category_id", "updated_by", "latitude", "longitude", "geo_accuracy", "shop_name", "shop_mall", "is_deleted" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;