-- Migration number: 0006 	 2025-12-29T12:29:51.710Z
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_email_codes` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`code` text(6) NOT NULL,
	`purpose` text NOT NULL,
	`valid_until` integer NOT NULL
);

INSERT INTO `__new_email_codes`(`id`, `version`, `created_at`, `updated_at`, `email`, `code`, `purpose`, `valid_until`) SELECT `id`, `version`, `created_at`, `updated_at`, `email`, `code`, `purpose`, `valid_until` FROM `email_codes`;
DROP TABLE `email_codes`;
ALTER TABLE `__new_email_codes` RENAME TO `email_codes`;
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_sessions` (
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

INSERT INTO `__new_sessions`(`id`, `version`, `created_at`, `updated_at`, `token`, `user_id`, `last_used_at`, `expires_at`, `login_attempt_id`) SELECT `id`, `version`, `created_at`, `updated_at`, `token`, `user_id`, `last_used_at`, `expires_at`, `login_attempt_id` FROM `sessions`;
DROP TABLE `sessions`;
ALTER TABLE `__new_sessions` RENAME TO `sessions`;
PRAGMA foreign_keys=ON;
DROP INDEX IF EXISTS `idx_email_codes_email`;
DROP INDEX IF EXISTS `idx_expenses_user_box_id_coord`;
DROP INDEX IF EXISTS `idx_expenses_user_coord`;
DROP INDEX IF EXISTS `idx_expenses_user_billed_account`;
DROP INDEX IF EXISTS `idx_expenses_user_billed_category`;
DROP INDEX IF EXISTS `idx_expenses_user_shopName`;
DROP INDEX IF EXISTS `idx_expenses_user_shopMall`;
CREATE INDEX `idx_email_codes_code` ON `email_codes` (`code`);
CREATE INDEX `idx_email_codes_email_valid_until` ON `email_codes` (`email`,`valid_until`);
CREATE INDEX `idx_sessions_token_expires` ON `sessions` (`token`,`expires_at`);
CREATE INDEX `idx_sessions_user_expires` ON `sessions` (`user_id`,`expires_at`);
CREATE INDEX `idx_expenses_user_box_id_active` ON `expenses` (`user_id`,`box_id`) WHERE "expenses"."is_deleted" = 0;
CREATE INDEX `idx_expenses_user_shopName_active` ON `expenses` (`user_id`,`billed_at`,`shop_name`) WHERE "expenses"."is_deleted" = 0;
CREATE INDEX `idx_expenses_user_shopMall_active` ON `expenses` (`user_id`,`billed_at`,`shop_mall`) WHERE "expenses"."is_deleted" = 0;
ALTER TABLE `expenses` DROP COLUMN `amount_cents_pre_refund`;