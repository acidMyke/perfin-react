ALTER TABLE `expenses` ADD `box_id` integer;
CREATE INDEX `idx_expenses_user_box_id_coord` ON `expenses` (`user_id`,`box_id`,`latitude`,`longitude`);