PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_email_codes` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`code` text(16) NOT NULL,
	`purpose` text NOT NULL,
	`valid_until` integer NOT NULL
);

INSERT INTO `__new_email_codes`(`id`, `version`, `created_at`, `updated_at`, `email`, `code`, `purpose`, `valid_until`) SELECT `id`, `version`, `created_at`, `updated_at`, `email`, `code`, `purpose`, `valid_until` FROM `email_codes`;
DROP TABLE `email_codes`;
ALTER TABLE `__new_email_codes` RENAME TO `email_codes`;
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
	`is_deleted` integer DEFAULT 0 NOT NULL
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
	`is_deleted` integer DEFAULT 0 NOT NULL
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
	`amount_cents_pre_refund` integer DEFAULT 0 NOT NULL,
	`billed_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`account_id` text(21),
	`category_id` text(21),
	`updated_by` text(21) NOT NULL,
	`latitude` real,
	`longitude` real,
	`geo_accuracy` real,
	`shop_name` text COLLATE NOCASE,
	`shop_mall` text COLLATE NOCASE,
	`additional_service_charge_percent` integer,
	`is_gst_excluded` integer,
	`is_deleted` integer DEFAULT 0 NOT NULL
);

INSERT INTO `__new_expenses`(`id`, `version`, `created_at`, `updated_at`, `amount_cents`, `amount_cents_pre_refund`, `billed_at`, `user_id`, `account_id`, `category_id`, `updated_by`, `latitude`, `longitude`, `geo_accuracy`, `shop_name`, `shop_mall`, `additional_service_charge_percent`, `is_gst_excluded`, `is_deleted`) SELECT `id`, `version`, `created_at`, `updated_at`, `amount_cents`, `amount_cents_pre_refund`, `billed_at`, `user_id`, `account_id`, `category_id`, `updated_by`, `latitude`, `longitude`, `geo_accuracy`, `shop_name`, `shop_mall`, `additional_service_charge_percent`, `is_gst_excluded`, `is_deleted` FROM `expenses`;
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
	`context` text COLLATE NOCASE DEFAULT '' NOT NULL,
	CONSTRAINT `search_pk` PRIMARY KEY(`chunk`, `text`, `type`, `user_id`, `context`)
);

INSERT INTO `__new_search`(`chunk`, `text`, `type`, `user_id`, `usage_count`, `context`) SELECT `chunk`, `text`, `type`, `user_id`, `usage_count`, `context` FROM `search`;
DROP TABLE `search`;
ALTER TABLE `__new_search` RENAME TO `search`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_users` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text COLLATE NOCASE NOT NULL UNIQUE,
	`email` text COLLATE NOCASE NOT NULL UNIQUE,
	`pass_salt` blob NOT NULL,
	`pass_digest` blob NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`released_after` integer
);

INSERT INTO `__new_users`(`id`, `version`, `created_at`, `updated_at`, `name`, `email`, `pass_salt`, `pass_digest`, `failed_attempts`, `released_after`) SELECT `id`, `version`, `created_at`, `updated_at`, `name`, `email`, `pass_salt`, `pass_digest`, `failed_attempts`, `released_after` FROM `users`;
DROP TABLE `users`;
ALTER TABLE `__new_users` RENAME TO `users`;
PRAGMA foreign_keys=ON;
CREATE INDEX `idx_email_codes_code` ON `email_codes` (`code`);
CREATE INDEX `idx_email_codes_email` ON `email_codes` (`email`);
CREATE INDEX `idx_expense_items_expense_id` ON `expense_items` (`expense_id`);
CREATE INDEX `idx_expense_items_name` ON `expense_items` (`name`);
CREATE INDEX `idx_expense_refund_expense_id` ON `expense_refunds` (`expense_id`);
CREATE INDEX `idx_expense_refund_expense_item_id` ON `expense_refunds` (`expense_item_id`);
CREATE INDEX `idx_expense_refund_source` ON `expense_refunds` (`source`);
CREATE INDEX `idx_expenses_user_billed` ON `expenses` (`user_id`,`billed_at`);
CREATE INDEX `idx_expenses_user_coord` ON `expenses` (`user_id`,`latitude`,`longitude`);
CREATE INDEX `idx_expenses_user_billed_account` ON `expenses` (`user_id`,`billed_at`,`account_id`);
CREATE INDEX `idx_expenses_user_billed_category` ON `expenses` (`user_id`,`billed_at`,`category_id`);
CREATE INDEX `idx_expenses_user_shopName` ON `expenses` (`user_id`,`billed_at`,`shop_name`);
CREATE INDEX `idx_expenses_user_shopMall` ON `expenses` (`user_id`,`billed_at`,`shop_mall`);
CREATE INDEX `idx_search_chunk` ON `search` (`user_id`,`type`,`chunk`);