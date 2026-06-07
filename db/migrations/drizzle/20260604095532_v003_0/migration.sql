CREATE TABLE `search_index_versions` (
	`id` text(21) PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`total_deleted_count` integer DEFAULT 0 NOT NULL,
	`deleted_expense_texts_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `uq_search_index_versions_user_id_version` UNIQUE(`user_id`,`version`)
);

ALTER TABLE `expenses_texts` ADD `ctx_text_hash` integer REFERENCES texts(text_hash);
ALTER TABLE `expenses_texts` ADD `version` integer DEFAULT 0 NOT NULL;
ALTER TABLE `texts_chunks` ADD `version` integer DEFAULT 0 NOT NULL;
ALTER TABLE `texts` ADD `version` integer DEFAULT 0 NOT NULL;