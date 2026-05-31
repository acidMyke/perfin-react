CREATE TABLE `user_devices` (
	`device_id` text(21) NOT NULL,
	`user_id` text(21) NOT NULL,
	`last_used_at` integer NOT NULL,
	`nickname` text,
	CONSTRAINT `user_devices_pk` PRIMARY KEY(`device_id`, `user_id`)
);

ALTER TABLE `login_attempts` ADD `device_id` text(21) NOT NULL;
ALTER TABLE `sessions` ADD `device_id` text(21) NOT NULL;
ALTER TABLE `sessions` DROP COLUMN `version`;
ALTER TABLE `sessions` DROP COLUMN `updated_at`;
ALTER TABLE `sessions` DROP COLUMN `last_used_at`;