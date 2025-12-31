CREATE TABLE `accounts` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `categories` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `email_codes` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`code` text(6) NOT NULL,
	`purpose` text NOT NULL,
	`valid_until` integer NOT NULL
);

CREATE TABLE `expense_items` (
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

CREATE TABLE `expense_refunds` (
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

CREATE TABLE `expenses` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`billed_at` integer NOT NULL,
	`user_id` text(21) NOT NULL,
	`account_id` text(21),
	`category_id` text(21),
	`updated_by` text(21) NOT NULL,
	`latitude` real,
	`longitude` real,
	`geo_accuracy` real,
	`box_id` integer,
	`shop_name` text COLLATE NOCASE,
	`shop_mall` text COLLATE NOCASE,
	`additional_service_charge_percent` integer,
	`is_gst_excluded` integer,
	`is_deleted` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `login_attempts` (
	`id` text(21) PRIMARY KEY,
	`timestamp` integer NOT NULL,
	`attempted_for_id` text(21),
	`is_success` integer NOT NULL,
	`ip` text NOT NULL,
	`asn` integer,
	`city` text,
	`region` text,
	`country` text(2),
	`colo` text(3),
	`user_agent` text
);

CREATE TABLE `passkeys` (
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`public_key` blob NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`nickname` text
);

CREATE TABLE `search` (
	`chunk` text NOT NULL,
	`text` text COLLATE NOCASE NOT NULL,
	`type` text NOT NULL,
	`user_id` text(21) NOT NULL,
	`usage_count` integer DEFAULT 1,
	`context` text COLLATE NOCASE DEFAULT '' NOT NULL,
	CONSTRAINT `search_pk` PRIMARY KEY(`chunk`, `text`, `type`, `user_id`, `context`)
);

CREATE TABLE `sessions` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`token` text(21) NOT NULL,
	`user_id` text(21) NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`login_attempt_id` text(21) NOT NULL
);

CREATE TABLE `users` (
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

CREATE INDEX `idx_accounts_user_seq` ON `accounts` (`user_id`,`sequence`,`created_at`);
CREATE INDEX `idx_categories_user_seq` ON `categories` (`user_id`,`sequence`,`created_at`);
CREATE INDEX `idx_email_codes_code` ON `email_codes` (`code`);
CREATE INDEX `idx_email_codes_email_valid_until` ON `email_codes` (`email`,`valid_until`);
CREATE INDEX `idx_expense_items_expense_id` ON `expense_items` (`expense_id`);
CREATE INDEX `idx_expense_items_name` ON `expense_items` (`name`);
CREATE INDEX `idx_expense_refund_expense_id` ON `expense_refunds` (`expense_id`);
CREATE INDEX `idx_expense_refund_expense_item_id` ON `expense_refunds` (`expense_item_id`);
CREATE INDEX `idx_expense_refund_source` ON `expense_refunds` (`source`);
CREATE INDEX `idx_expenses_user_billed` ON `expenses` (`user_id`,`billed_at`,`is_deleted`);
CREATE INDEX `idx_expenses_user_box_id_active` ON `expenses` (`user_id`,`box_id`) WHERE "expenses"."is_deleted" = 0;
CREATE INDEX `idx_expenses_user_shopName_active` ON `expenses` (`user_id`,`billed_at`,`shop_name`) WHERE "expenses"."is_deleted" = 0;
CREATE INDEX `idx_expenses_user_shopMall_active` ON `expenses` (`user_id`,`billed_at`,`shop_mall`) WHERE "expenses"."is_deleted" = 0;
CREATE INDEX `idx_login_attempts_ip_time` ON `login_attempts` (`ip`,`timestamp`);
CREATE INDEX `idx_login_attempts_user_time` ON `login_attempts` (`attempted_for_id`,`timestamp`);
CREATE INDEX `idx_passkeys_user_id` ON `passkeys` (`user_id`);
CREATE INDEX `idx_search_chunk` ON `search` (`user_id`,`type`,`chunk`);
CREATE INDEX `idx_sessions_token_expires` ON `sessions` (`token`,`expires_at`);
CREATE INDEX `idx_sessions_user_expires` ON `sessions` (`user_id`,`expires_at`);