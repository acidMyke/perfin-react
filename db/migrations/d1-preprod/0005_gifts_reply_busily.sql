-- Migration number: 0005 	 2025-12-27T04:01:15.079Z
ALTER TABLE `expenses` ADD `box_id` integer;
UPDATE expenses SET box_id = ((CAST(latitude / 0.002 AS INTEGER) << 16) | CAST(longitude / 0.002 AS INTEGER))
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX `idx_expenses_user_box_id_coord` ON `expenses` (`user_id`,`box_id`,`latitude`,`longitude`);
ANALYZE;