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
	`text_id` blob NOT NULL,
	`source_id` text(21) NOT NULL,
	`expense_billed_at` integer NOT NULL,
	`ctx_text_id` blob,
	`index_gen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `expenses_texts_pk` PRIMARY KEY(`text_id`, `source_id`),
	CONSTRAINT `fk_expenses_texts_text_id_texts_id_fk` FOREIGN KEY (`text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_expenses_texts_ctx_text_id_texts_id_fk` FOREIGN KEY (`ctx_text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE `geo_cells` (
	`id` integer PRIMARY KEY,
	`min_lat` real NOT NULL,
	`max_lat` real NOT NULL,
	`min_lng` real NOT NULL,
	`max_lng` real NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `geo_texts` (
	`text_id` blob NOT NULL,
	`geo_cell_id` integer NOT NULL,
	`index_gen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `geo_texts_pk` PRIMARY KEY(`geo_cell_id`, `text_id`),
	CONSTRAINT `fk_geo_texts_text_id_texts_id_fk` FOREIGN KEY (`text_id`) REFERENCES `texts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_geo_texts_geo_cell_id_geo_cells_id_fk` FOREIGN KEY (`geo_cell_id`) REFERENCES `geo_cells`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX `idx_expenses_texts_sourceId` ON `expenses_texts` (`source_id`);
CREATE INDEX `idx_textHash_expenseId` ON `expenses_texts` (`text_id`,`expense_id`);
CREATE INDEX `idx_user_chunks` ON `texts_chunks` (`user_id`,`kind`,`chunk`,`text_id`);