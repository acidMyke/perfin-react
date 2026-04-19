PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_accounts` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);

INSERT INTO `__new_accounts`(`id`, `version`, `created_at`, `updated_at`, `user_id`, `name`, `description`, `sequence`, `is_deleted`) SELECT `id`, `version`, `created_at`, `updated_at`, `user_id`, `name`, `description`, `sequence`, `is_deleted` FROM `accounts`;
DROP TABLE `accounts`;
ALTER TABLE `__new_accounts` RENAME TO `accounts`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_categories` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);

INSERT INTO `__new_categories`(`id`, `version`, `created_at`, `updated_at`, `user_id`, `name`, `description`, `sequence`, `is_deleted`) SELECT `id`, `version`, `created_at`, `updated_at`, `user_id`, `name`, `description`, `sequence`, `is_deleted` FROM `categories`;
DROP TABLE `categories`;
ALTER TABLE `__new_categories` RENAME TO `categories`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_expense_adjustments` (
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
	`is_deleted` integer DEFAULT false NOT NULL,
	`is_inferable` integer DEFAULT false NOT NULL
);

INSERT INTO `__new_expense_adjustments`(`id`, `version`, `created_at`, `updated_at`, `sequence`, `name`, `amount_cents`, `rate_bps`, `expense_id`, `expense_item_id`, `is_deleted`, `is_inferable`) SELECT `id`, `version`, `created_at`, `updated_at`, `sequence`, `name`, `amount_cents`, `rate_bps`, `expense_id`, `expense_item_id`, `is_deleted`, `is_inferable` FROM `expense_adjustments`;
DROP TABLE `expense_adjustments`;
ALTER TABLE `__new_expense_adjustments` RENAME TO `expense_adjustments`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_expense_items` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sequence` integer NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`expense_id` text(21) NOT NULL,
	`category_id` text(21),
	`expense_refund_id` text(21),
	`is_deleted` integer DEFAULT false NOT NULL
);

INSERT INTO `__new_expense_items`(`id`, `version`, `created_at`, `updated_at`, `sequence`, `name`, `quantity`, `price_cents`, `expense_id`, `category_id`, `expense_refund_id`, `is_deleted`) SELECT `id`, `version`, `created_at`, `updated_at`, `sequence`, `name`, `quantity`, `price_cents`, `expense_id`, `category_id`, `expense_refund_id`, `is_deleted` FROM `expense_items`;
DROP TABLE `expense_items`;
ALTER TABLE `__new_expense_items` RENAME TO `expense_items`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_expense_refunds` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expense_id` text(21) NOT NULL,
	`expense_item_id` text(21),
	`expected_amount_cents` integer DEFAULT 0 NOT NULL,
	`actual_amount_cents` integer,
	`confirmed_at` integer,
	`source` text COLLATE NOCASE NOT NULL,
	`note` text,
	`sequence` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL
);

INSERT INTO `__new_expense_refunds`(`id`, `version`, `created_at`, `updated_at`, `expense_id`, `expense_item_id`, `expected_amount_cents`, `actual_amount_cents`, `confirmed_at`, `source`, `note`, `sequence`, `is_deleted`) SELECT `id`, `version`, `created_at`, `updated_at`, `expense_id`, `expense_item_id`, `expected_amount_cents`, `actual_amount_cents`, `confirmed_at`, `source`, `note`, `sequence`, `is_deleted` FROM `expense_refunds`;
DROP TABLE `expense_refunds`;
ALTER TABLE `__new_expense_refunds` RENAME TO `expense_refunds`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_expenses` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`specified_amount_cents` integer DEFAULT 0 NOT NULL,
	`billed_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`account_id` text(21),
	`category_id` text(21),
	`type` text NOT NULL,
	`updated_by` text(21) NOT NULL,
	`latitude` real,
	`longitude` real,
	`geo_accuracy` real,
	`box_id` integer,
	`shop_name` text COLLATE NOCASE,
	`shop_mall` text COLLATE NOCASE,
	`additional_service_charge_percent` integer,
	`is_gst_excluded` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);

INSERT INTO `__new_expenses`(`id`, `version`, `created_at`, `updated_at`, `amount_cents`, `specified_amount_cents`, `billed_at`, `user_id`, `account_id`, `category_id`, `type`, `updated_by`, `latitude`, `longitude`, `geo_accuracy`, `box_id`, `shop_name`, `shop_mall`, `additional_service_charge_percent`, `is_gst_excluded`, `is_deleted`) SELECT `id`, `version`, `created_at`, `updated_at`, `amount_cents`, `specified_amount_cents`, `billed_at`, `user_id`, `account_id`, `category_id`, `type`, `updated_by`, `latitude`, `longitude`, `geo_accuracy`, `box_id`, `shop_name`, `shop_mall`, `additional_service_charge_percent`, `is_gst_excluded`, `is_deleted` FROM `expenses`;
DROP TABLE `expenses`;
ALTER TABLE `__new_expenses` RENAME TO `expenses`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_search` (
	`chunk` text NOT NULL,
	`text` text COLLATE NOCASE NOT NULL,
	`type` text NOT NULL,
	`user_id` text(21) NOT NULL,
	`usage_count` integer DEFAULT 1,
	`context` text COLLATE NOCASE NOT NULL,
	CONSTRAINT `search_pk` PRIMARY KEY(`chunk`, `text`, `type`, `user_id`, `context`)
);

INSERT INTO `__new_search`(`chunk`, `text`, `type`, `user_id`, `usage_count`, `context`) SELECT `chunk`, `text`, `type`, `user_id`, `usage_count`, `context` FROM `search`;
DROP TABLE `search`;
ALTER TABLE `__new_search` RENAME TO `search`;
PRAGMA foreign_keys=ON;
CREATE INDEX `idx_accounts_user_seq` ON `accounts` (`user_id`,`sequence`,`created_at`);
CREATE INDEX `idx_categories_user_seq` ON `categories` (`user_id`,`sequence`,`created_at`);
CREATE INDEX `idx_expense_adjustments_expense_id` ON `expense_adjustments` (`expense_id`);
CREATE INDEX `idx_expense_adjustments_inferrable` ON `expense_adjustments` (`expense_id`,`name`,`rate_bps`) WHERE "expense_adjustments"."is_inferable" = 1;
CREATE INDEX `idx_expense_items_expense_id` ON `expense_items` (`expense_id`);
CREATE INDEX `idx_expense_refund_expense_id` ON `expense_refunds` (`expense_id`);
CREATE INDEX `idx_expense_refund_expense_item_id` ON `expense_refunds` (`expense_item_id`);
CREATE INDEX `idx_expense_refund_source` ON `expense_refunds` (`source`);
CREATE INDEX `idx_expenses_partial_user_box_shop` ON `expenses` (`user_id`,`box_id`,`shop_name`,`shop_mall`) WHERE ("expenses"."shop_name" is not null);
CREATE INDEX `idx_expenses_id_account_category` ON `expenses` (`id`,`account_id`,`category_id`);
CREATE INDEX `idx_expenses_user_billedAt` ON `expenses` (`user_id`,`billed_at`);
CREATE INDEX `idx_search_chunk` ON `search` (`user_id`,`type`,`chunk`);
CREATE INDEX `idx_search_context` ON `search` (`user_id`,`type`,`context`);