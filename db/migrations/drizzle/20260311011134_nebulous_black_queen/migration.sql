CREATE TABLE `expense_adjustments` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sequence` integer NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`amount_cents` integer NOT NULL,
	`rate_bps` integer,
	`expense_id` text(21) NOT NULL,
	`expense_item_id` text(21),
	`is_deleted` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `merchants` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`mall` text COLLATE NOCASE,
	`url` text,
	`type` text,
	`typical_account_id` text(21),
	`typical_category_id` text(21),
	`latitude` real,
	`longitude` real,
	`geo_id` integer,
	`is_deleted` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `system_flag` (
	`key` text PRIMARY KEY,
	`value` integer DEFAULT -1 NOT NULL
);

ALTER TABLE `expenses` ADD `merchant_id` text(21);
ALTER TABLE `search` ADD `merchant_id` text(21);
ALTER TABLE `search` ADD `reference_ids` text DEFAULT '[]';
DROP INDEX IF EXISTS `idx_search_chunk`;
DROP INDEX IF EXISTS `idx_search_context`;
DROP INDEX IF EXISTS `idx_expenses_user_box_id_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopName_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopMall_active`;
CREATE INDEX `idx_expense_adjustments_expense_id` ON `expense_adjustments` (`expense_id`);
CREATE INDEX `idx_merchants_user_box` ON `merchants` (`user_id`,`geo_id`);
CREATE INDEX `idx_merchants_user_shopName_active` ON `merchants` (`user_id`,`name`) WHERE "merchants"."is_deleted" = 0;
CREATE INDEX `idx_merchants_user_shopMall_active` ON `merchants` (`user_id`,`mall`) WHERE "merchants"."is_deleted" = 0;
CREATE INDEX `idx_search_user_chunk` ON `search` (`user_id`,`chunk`);
CREATE INDEX `idx_search_user_text` ON `search` (`user_id`,`text`);
CREATE INDEX `idx_search_user_type_context` ON `search` (`user_id`,`type`,`context`);