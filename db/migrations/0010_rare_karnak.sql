CREATE TABLE `expense_refunds` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expense_id` text(8) NOT NULL,
	`expense_item_id` text(8),
	`expected_amount_cents` integer DEFAULT 0 NOT NULL,
	`actual_amount_cents` integer,
	`confirmed_at` integer,
	`source` text NOT NULL,
	`note` text,
	`sequence` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `expense_items` ADD `expense_refund_id` text(8);--> statement-breakpoint
ALTER TABLE `expenses` ADD `amount_cents_pre_refund` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `excluded_service_charge` integer;--> statement-breakpoint
ALTER TABLE `expenses` ADD `excluded_gst` integer;