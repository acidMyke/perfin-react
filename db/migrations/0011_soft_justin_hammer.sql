PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`belongs_to_id` text(21) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "version", "created_at", "updated_at", "belongs_to_id", "name", "description", "sequence", "is_deleted") SELECT "id", "version", "created_at", "updated_at", "belongs_to_id", "name", "description", "sequence", "is_deleted" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`belongs_to_id` text(21) NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sequence` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "version", "created_at", "updated_at", "belongs_to_id", "name", "description", "sequence", "is_deleted") SELECT "id", "version", "created_at", "updated_at", "belongs_to_id", "name", "description", "sequence", "is_deleted" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
CREATE TABLE `__new_email_codes` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text NOT NULL,
	`code` text(16) NOT NULL,
	`purpose` text NOT NULL,
	`valid_until` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_email_codes`("id", "version", "created_at", "updated_at", "email", "code", "purpose", "valid_until") SELECT "id", "version", "created_at", "updated_at", "email", "code", "purpose", "valid_until" FROM `email_codes`;--> statement-breakpoint
DROP TABLE `email_codes`;--> statement-breakpoint
ALTER TABLE `__new_email_codes` RENAME TO `email_codes`;--> statement-breakpoint
CREATE TABLE `__new_expense_items` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sequence` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`expense_id` text(21) NOT NULL,
	`category_id` text(21),
	`expense_refund_id` text(21),
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_expense_items`("id", "version", "created_at", "updated_at", "sequence", "name", "quantity", "price_cents", "expense_id", "category_id", "expense_refund_id", "is_deleted") SELECT "id", "version", "created_at", "updated_at", "sequence", "name", "quantity", "price_cents", "expense_id", "category_id", "expense_refund_id", "is_deleted" FROM `expense_items`;--> statement-breakpoint
DROP TABLE `expense_items`;--> statement-breakpoint
ALTER TABLE `__new_expense_items` RENAME TO `expense_items`;--> statement-breakpoint
CREATE TABLE `__new_expense_refunds` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expense_id` text(21) NOT NULL,
	`expense_item_id` text(21),
	`expected_amount_cents` integer DEFAULT 0 NOT NULL,
	`actual_amount_cents` integer,
	`confirmed_at` integer,
	`source` text NOT NULL,
	`note` text,
	`sequence` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_expense_refunds`("id", "version", "created_at", "updated_at", "expense_id", "expense_item_id", "expected_amount_cents", "actual_amount_cents", "confirmed_at", "source", "note", "sequence", "is_deleted") SELECT "id", "version", "created_at", "updated_at", "expense_id", "expense_item_id", "expected_amount_cents", "actual_amount_cents", "confirmed_at", "source", "note", "sequence", "is_deleted" FROM `expense_refunds`;--> statement-breakpoint
DROP TABLE `expense_refunds`;--> statement-breakpoint
ALTER TABLE `__new_expense_refunds` RENAME TO `expense_refunds`;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`amount_cents_pre_refund` integer DEFAULT 0 NOT NULL,
	`billed_at` integer NOT NULL,
	`belongs_to_id` text(21) NOT NULL,
	`account_id` text(21),
	`category_id` text(21),
	`updated_by` text(21) NOT NULL,
	`latitude` real,
	`longitude` real,
	`geo_accuracy` real,
	`shop_name` text,
	`shop_mall` text,
	`excluded_service_charge` integer,
	`excluded_gst` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "version", "created_at", "updated_at", "amount_cents", "amount_cents_pre_refund", "billed_at", "belongs_to_id", "account_id", "category_id", "updated_by", "latitude", "longitude", "geo_accuracy", "shop_name", "shop_mall", "excluded_service_charge", "excluded_gst", "is_deleted") SELECT "id", "version", "created_at", "updated_at", "amount_cents", "amount_cents_pre_refund", "billed_at", "belongs_to_id", "account_id", "category_id", "updated_by", "latitude", "longitude", "geo_accuracy", "shop_name", "shop_mall", "excluded_service_charge", "excluded_gst", "is_deleted" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
CREATE TABLE `__new_histories` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text(21) NOT NULL,
	`values_were` text NOT NULL,
	`version_was` integer NOT NULL,
	`was_updated_at` integer NOT NULL,
	`was_updated_by` text(21)
);
--> statement-breakpoint
INSERT INTO `__new_histories`("id", "table_name", "row_id", "values_were", "version_was", "was_updated_at", "was_updated_by") SELECT "id", "table_name", "row_id", "values_were", "version_was", "was_updated_at", "was_updated_by" FROM `histories`;--> statement-breakpoint
DROP TABLE `histories`;--> statement-breakpoint
ALTER TABLE `__new_histories` RENAME TO `histories`;--> statement-breakpoint
CREATE TABLE `__new_login_attempts` (
	`id` text(21) PRIMARY KEY NOT NULL,
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
--> statement-breakpoint
INSERT INTO `__new_login_attempts`("id", "timestamp", "attempted_for_id", "is_success", "ip", "asn", "city", "region", "country", "colo", "user_agent") SELECT "id", "timestamp", "attempted_for_id", "is_success", "ip", "asn", "city", "region", "country", "colo", "user_agent" FROM `login_attempts`;--> statement-breakpoint
DROP TABLE `login_attempts`;--> statement-breakpoint
ALTER TABLE `__new_login_attempts` RENAME TO `login_attempts`;--> statement-breakpoint
CREATE TABLE `__new_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text(21) NOT NULL,
	`public_key` blob,
	`sign_count` integer NOT NULL,
	`challenge` text,
	`challenged_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_passkeys`("id", "user_id", "public_key", "sign_count", "challenge", "challenged_at", "created_at") SELECT "id", "user_id", "public_key", "sign_count", "challenge", "challenged_at", "created_at" FROM `passkeys`;--> statement-breakpoint
DROP TABLE `passkeys`;--> statement-breakpoint
ALTER TABLE `__new_passkeys` RENAME TO `passkeys`;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`token` text(16) NOT NULL,
	`user_id` text(21) NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`login_attempt_id` text(21) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "version", "created_at", "updated_at", "token", "user_id", "last_used_at", "expires_at", "login_attempt_id") SELECT "id", "version", "created_at", "updated_at", "token", "user_id", "last_used_at", "expires_at", "login_attempt_id" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`pass_salt` blob NOT NULL,
	`pass_digest` blob NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`released_after` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "version", "created_at", "updated_at", "name", "email", "pass_salt", "pass_digest", "failed_attempts", "released_after") SELECT "id", "version", "created_at", "updated_at", "name", "email", "pass_salt", "pass_digest", "failed_attempts", "released_after" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);