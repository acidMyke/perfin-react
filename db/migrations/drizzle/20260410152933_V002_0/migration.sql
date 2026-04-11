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
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`is_inferable` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `expenses_texts` (
	`expense_id` text(21) NOT NULL,
	`text_hash` integer NOT NULL,
	`source_id` text(21) NOT NULL,
	CONSTRAINT `expenses_texts_pk` PRIMARY KEY(`text_hash`, `source_id`),
	CONSTRAINT `fk_expenses_texts_text_hash_texts_text_hash_fk` FOREIGN KEY (`text_hash`) REFERENCES `texts`(`text_hash`) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE `texts_chunks` (
	`user_id` text(21) NOT NULL,
	`chunk` text NOT NULL,
	`text_hash` integer NOT NULL,
	CONSTRAINT `texts_chunks_pk` PRIMARY KEY(`text_hash`, `chunk`),
	CONSTRAINT `fk_texts_chunks_text_hash_texts_text_hash_fk` FOREIGN KEY (`text_hash`) REFERENCES `texts`(`text_hash`) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE `texts_contexts` (
	`text_hash` integer NOT NULL,
	`ctx_text_hash` integer NOT NULL,
	CONSTRAINT `texts_contexts_pk` PRIMARY KEY(`text_hash`, `ctx_text_hash`),
	CONSTRAINT `fk_texts_contexts_text_hash_texts_text_hash_fk` FOREIGN KEY (`text_hash`) REFERENCES `texts`(`text_hash`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_texts_contexts_ctx_text_hash_texts_text_hash_fk` FOREIGN KEY (`ctx_text_hash`) REFERENCES `texts`(`text_hash`) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE `texts` (
	`text_hash` integer PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`text` text NOT NULL,
	CONSTRAINT `uq_texts_userId` UNIQUE(`user_id`,`text`)
);

ALTER TABLE `expenses` ADD `specified_amount_cents` integer DEFAULT 0 NOT NULL;
ALTER TABLE `expenses` ADD `type` text NOT NULL;
DROP INDEX IF EXISTS `idx_expenses_user_billed`;
DROP INDEX IF EXISTS `idx_expenses_user_box_id_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopName_active`;
DROP INDEX IF EXISTS `idx_expenses_user_shopMall_active`;
DROP INDEX IF EXISTS `idx_expense_items_name`;
CREATE INDEX `idx_expense_adjustments_expense_id` ON `expense_adjustments` (`expense_id`);
CREATE INDEX `idx_expense_adjustments_inferrable` ON `expense_adjustments` (`expense_id`,`name`,`rate_bps`) WHERE "expense_adjustments"."is_inferable" = 1;
CREATE INDEX `idx_expenses_texts_sourceId` ON `expenses_texts` (`source_id`);
CREATE INDEX `idx_textHash_expenseId` ON `expenses_texts` (`text_hash`,`expense_id`);
CREATE INDEX `idx_expenses_partial_user_box_shop` ON `expenses` (`user_id`,`box_id`,`shop_name`,`shop_mall`) WHERE ("expenses"."shop_name" is not null);
CREATE INDEX `idx_expenses_id_account_category` ON `expenses` (`id`,`account_id`,`category_id`);
CREATE INDEX `idx_expenses_user_billedAt` ON `expenses` (`user_id`,`billed_at`);
CREATE INDEX `idx_user_chunks` ON `texts_chunks` (`user_id`,`chunk`,`text_hash`);
CREATE INDEX `idx_texts_contexts_ctxTextHash_textHash` ON `texts_contexts` (`ctx_text_hash`,`text_hash`);