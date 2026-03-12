CREATE TABLE `expense_adjustments` (
	`id` text(21) PRIMARY KEY,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sequence` integer NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`amount_cents` integer NOT NULL,
	`rate_bps` integer,
	`expense_id` text(21) NOT NULL,
	`expense_item_id` text(21),
	`user_id` text(21) DEFAULT '' NOT NULL,
	`shop_name` text COLLATE NOCASE DEFAULT '' NOT NULL,
	`is_deleted` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `expenses_texts` (
	`expense_id` text(21) NOT NULL,
	`text_hash` integer NOT NULL,
	`source_id` text(21) NOT NULL,
	CONSTRAINT `expenses_texts_pk` PRIMARY KEY(`text_hash`, `source_id`)
);

CREATE TABLE `texts_chunks` (
	`user_id` text NOT NULL,
	`chunk` text NOT NULL,
	`text_hash` integer NOT NULL,
	CONSTRAINT `texts_chunks_pk` PRIMARY KEY(`text_hash`, `chunk`)
);

CREATE TABLE `texts_contexts` (
	`text_hash` integer NOT NULL,
	`ctx_text_hash` integer NOT NULL,
	CONSTRAINT `texts_contexts_pk` PRIMARY KEY(`text_hash`, `ctx_text_hash`)
);

ALTER TABLE `expense_items` ADD `user_id` text(21) DEFAULT '' NOT NULL;
ALTER TABLE `expense_items` ADD `shop_name` text COLLATE NOCASE DEFAULT '' NOT NULL;
ALTER TABLE `expenses` ADD `specified_amount_cents` integer DEFAULT 0 NOT NULL;
ALTER TABLE `expenses` ADD `merchant_id` text(21);
DROP INDEX IF EXISTS `idx_expense_items_name`;
DROP INDEX IF EXISTS `idx_expenses_user_box_id_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopName_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopMall_active`;
CREATE INDEX `idx_expense_adjustments_expense_id` ON `expense_adjustments` (`expense_id`);
CREATE INDEX `idx_expense_adjustments_user_shop` ON `expense_adjustments` (`user_id`,`shop_name`);
CREATE INDEX `idx_expense_items_user_shop` ON `expense_items` (`user_id`,`shop_name`);
CREATE INDEX `idx_expenses_texts_sourceId` ON `expenses_texts` (`source_id`);
CREATE INDEX `idx_textHash_expenseId` ON `expenses_texts` (`text_hash`,`expense_id`);
CREATE INDEX `idx_expenses_user_shopName` ON `expenses` (`user_id`,`shop_name`);
CREATE INDEX `idx_expenses_user_shopMall` ON `expenses` (`user_id`,`shop_mall`);
CREATE INDEX `idx_user_chunks` ON `texts_chunks` (`user_id`,`chunk`,`text_hash`);