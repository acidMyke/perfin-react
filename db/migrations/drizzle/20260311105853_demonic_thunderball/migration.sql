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
	`user_id` text(21) DEFAULT '' NOT NULL,
	`shop_name` text COLLATE NOCASE DEFAULT '' NOT NULL,
	`is_deleted` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `geo_search` (
	`geo_id` integer NOT NULL,
	`shop_name` text COLLATE NOCASE NOT NULL,
	`shop_mall` text COLLATE NOCASE NOT NULL,
	`user_id` text(21) NOT NULL,
	`latitude` real,
	`longitude` real,
	CONSTRAINT `geo_search_pk` PRIMARY KEY(`geo_id`, `user_id`, `shop_mall`, `shop_name`)
);

ALTER TABLE `expense_items` ADD `user_id` text(21) DEFAULT '' NOT NULL;
ALTER TABLE `expense_items` ADD `shop_name` text COLLATE NOCASE DEFAULT '' NOT NULL;
ALTER TABLE `expenses` ADD `specified_amount_cents` integer DEFAULT 0 NOT NULL;
ALTER TABLE `expenses` ADD `merchant_id` text(21);
ALTER TABLE `search` ADD `reference_ids` text DEFAULT '[]';
DROP INDEX IF EXISTS `idx_expense_items_name`;
DROP INDEX IF EXISTS `idx_expenses_user_box_id_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopName_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopMall_active`;
DROP INDEX IF EXISTS `idx_search_chunk`;
DROP INDEX IF EXISTS `idx_search_context`;
CREATE INDEX `idx_expense_adjustments_expense_id` ON `expense_adjustments` (`expense_id`);
CREATE INDEX `idx_expense_adjustments_user_shop` ON `expense_adjustments` (`user_id`,`shop_name`);
CREATE INDEX `idx_expense_items_user_shop` ON `expense_items` (`user_id`,`shop_name`);
CREATE INDEX `idx_expenses_user_shopName` ON `expenses` (`user_id`,`shop_name`);
CREATE INDEX `idx_expenses_user_shopMall` ON `expenses` (`user_id`,`shop_mall`);
CREATE INDEX `idx_geo_search_user_geoId` ON `geo_search` (`user_id`,`geo_id`);
CREATE INDEX `idx_search_user_chunk` ON `search` (`user_id`,`chunk`);
CREATE INDEX `idx_search_user_text` ON `search` (`user_id`,`text`);
CREATE INDEX `idx_search_user_type_context` ON `search` (`user_id`,`type`,`context`);