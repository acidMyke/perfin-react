DROP INDEX IF EXISTS `idx_expense_refund_expense_id`;
DROP INDEX IF EXISTS `idx_expense_refund_expense_item_id`;
DROP INDEX IF EXISTS `idx_expense_refund_source`;
DROP INDEX IF EXISTS `idx_expenses_texts_sourceId`;
DROP INDEX IF EXISTS `idx_textHash_expenseId`;
DROP INDEX IF EXISTS `idx_search_chunk`;
DROP INDEX IF EXISTS `idx_search_context`;
DROP INDEX IF EXISTS `idx_user_chunks`;
DROP INDEX IF EXISTS `idx_texts_contexts_ctxTextHash_textHash`;
DROP TABLE IF EXISTS `expense_refunds`;
DROP TABLE IF EXISTS `expenses_texts`;
DROP TABLE IF EXISTS `search_index_versions`;
DROP TABLE IF EXISTS `search`;
DROP TABLE IF EXISTS `texts_chunks`;
DROP TABLE IF EXISTS `texts_contexts`;
DROP TABLE IF EXISTS `texts`;
ALTER TABLE `expense_items` DROP COLUMN `expense_refund_id`;

-- Recreate indexing tables
CREATE TABLE `search_index_generations` (
	`id` text(21) PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`current_gen` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`records_processed` integer DEFAULT 0 NOT NULL,
	`total_deleted_count` integer DEFAULT 0 NOT NULL,
	`deleted_expense_texts_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `uq_search_index_versions_user_id_version` UNIQUE(`user_id`,`current_gen`)
);

CREATE TABLE `texts` (
	`id` blob PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer NOT NULL,
	`usage_count` integer NOT NULL,
	CONSTRAINT `uq_texts_user_id_kind_text` UNIQUE(`user_id`,`kind`,`text`)
) WITHOUT ROWID;

CREATE TABLE `texts_chunks` (
	`user_id` text(21) NOT NULL,
	`kind` text NOT NULL,
	`chunk` text NOT NULL,
	`text_id` blob NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `texts_chunks_pk` PRIMARY KEY(`text_id`, `chunk`),
	CONSTRAINT `fk_texts_chunks_text_id_texts_id_fk` FOREIGN KEY (`text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE `expenses_texts` (
	`expense_id` text(21) NOT NULL,
	`expense_billed_at` integer NOT NULL,
	`text_id` blob NOT NULL,
	`source_id` text(21) NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `expenses_texts_pk` PRIMARY KEY(`text_id`, `source_id`),
	CONSTRAINT `fk_expenses_texts_text_id_texts_id_fk` FOREIGN KEY (`text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE `geo_cells` (
	`id` integer PRIMARY KEY,
	`lat_index` integer NOT NULL,
	`lon_index` integer NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `ctx_texts` (
	`text_id` blob NOT NULL,
	`ctx_text_id` blob NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `ctx_texts_pk` PRIMARY KEY(`ctx_text_id`, `text_id`),
	CONSTRAINT `fk_ctx_texts_text_id_texts_id_fk` FOREIGN KEY (`text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_ctx_texts_ctx_text_id_texts_id_fk` FOREIGN KEY (`ctx_text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE `geo_texts` (
	`text_id` blob NOT NULL,
	`user_id` text(21) NOT NULL,
	`geo_cell_id` integer NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `geo_texts_pk` PRIMARY KEY(`user_id`, `geo_cell_id`, `text_id`),
	CONSTRAINT `fk_geo_texts_text_id_texts_id_fk` FOREIGN KEY (`text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_geo_texts_geo_cell_id_geo_cells_id_fk` FOREIGN KEY (`geo_cell_id`) REFERENCES `geo_cells`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX `idx_expenses_texts_sourceId` ON `expenses_texts` (`source_id`);
CREATE INDEX `idx_textHash_expenseId` ON `expenses_texts` (`text_id`,`expense_id`);
CREATE INDEX `idx_user_chunks` ON `texts_chunks` (`user_id`,`kind`,`chunk`,`text_id`);
CREATE INDEX `idx_ctx_texts` ON `ctx_texts` (`text_id`,`ctx_text_id`);
CREATE INDEX `idx_geo_texts` ON `geo_texts` (`text_id`,`geo_cell_id`);