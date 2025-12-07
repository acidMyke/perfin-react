PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS "accounts" (
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
CREATE TABLE IF NOT EXISTS "categories" (
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
CREATE TABLE IF NOT EXISTS "email_codes" (
	`id` text(21) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text NOT NULL,
	`code` text(16) NOT NULL,
	`purpose` text NOT NULL,
	`valid_until` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS "expense_items" (
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
CREATE TABLE IF NOT EXISTS "expense_refunds" (
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
CREATE TABLE IF NOT EXISTS "expenses" (
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
	"additional_service_charge_percent" integer,
	"is_gst_excluded" integer,
	`is_deleted` integer DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS "histories" (
	`id` text(21) PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text(21) NOT NULL,
	`values_were` text NOT NULL,
	`version_was` integer NOT NULL,
	`was_updated_at` integer NOT NULL,
	`was_updated_by` text(21)
);
CREATE TABLE IF NOT EXISTS "login_attempts" (
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
CREATE TABLE IF NOT EXISTS "passkeys" (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text(21) NOT NULL,
	`public_key` blob,
	`sign_count` integer NOT NULL,
	`challenge` text,
	`challenged_at` integer,
	`created_at` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS "sessions" (
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
CREATE TABLE IF NOT EXISTS "users" (
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
DELETE FROM sqlite_sequence;
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);