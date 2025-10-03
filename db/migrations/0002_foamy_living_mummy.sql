CREATE TABLE `expense_items` (
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
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	`mall` text
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `shop_id` text(8) REFERENCES shops(id);--> statement-breakpoint
ALTER TABLE `expenses` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `expenses` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `expenses` ADD `geo_accuracy` real;