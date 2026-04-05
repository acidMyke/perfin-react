ALTER TABLE `expense_adjustments` ADD `is_inferable` integer DEFAULT 0 NOT NULL;
DROP INDEX IF EXISTS `idx_expenses_user_box_id`;
DROP INDEX IF EXISTS `idx_expenses_user_billed`;
CREATE INDEX `idx_expense_adjustments_inferrable` ON `expense_adjustments` (`expense_id`,`name`,`rate_bps`) WHERE "expense_adjustments"."is_inferable" = 1;
CREATE INDEX `idx_expenses_partial_user_box_shop` ON `expenses` (`user_id`,`box_id`,`shop_name`,`shop_mall`) WHERE ("expenses"."shop_name" is not null);
CREATE INDEX `idx_expenses_id_account_category` ON `expenses` (`id`,`account_id`,`category_id`);
CREATE INDEX `idx_expenses_user_billedAt` ON `expenses` (`user_id`,`billed_at`);