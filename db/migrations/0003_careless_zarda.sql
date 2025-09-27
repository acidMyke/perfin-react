DROP TABLE `shops`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
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
	`updated_by` text(8) NOT NULL,
	`latitude` real,
	`longitude` real,
	`geo_accuracy` real,
	`shop_name` text,
	`shop_mall` text,
	FOREIGN KEY (`belongs_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `ledger_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "version", "created_at", "updated_at", "description", "amount_cents", "billed_at", "belongs_to_id", "account_id", "category_id", "updated_by", "latitude", "longitude", "geo_accuracy", "shop_name", "shop_mall") SELECT "id", "version", "created_at", "updated_at", "description", "amount_cents", "billed_at", "belongs_to_id", "account_id", "category_id", "updated_by", "latitude", "longitude", "geo_accuracy", "shop_name", "shop_mall" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;