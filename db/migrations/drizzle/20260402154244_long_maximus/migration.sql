CREATE TABLE `geo_texts` (
	`user_id` text(21) NOT NULL,
	`geo_id` integer NOT NULL,
	`text_hash` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	CONSTRAINT `geo_texts_pk` PRIMARY KEY(`user_id`, `geo_id`, `text_hash`),
	CONSTRAINT `fk_geo_texts_text_hash_texts_text_hash_fk` FOREIGN KEY (`text_hash`) REFERENCES `texts`(`text_hash`) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE `expense_adjustments` ADD `is_inferable` integer DEFAULT 0 NOT NULL;
ALTER TABLE `expenses` ADD `geo_id` integer;
CREATE INDEX `idx_expense_adjustments_inferrable` ON `expense_adjustments` (`expense_id`,`name`,`rate_bps`) WHERE "expense_adjustments"."is_inferable" = 1;