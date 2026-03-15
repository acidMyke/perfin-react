ALTER TABLE `expenses` ADD `type` text NOT NULL;
DROP INDEX IF EXISTS `idx_expenses_user_box_id_active`;
CREATE INDEX `idx_expenses_user_box_id` ON `expenses` (`user_id`,`box_id`);
ALTER TABLE `expenses` DROP COLUMN `merchant_id`;