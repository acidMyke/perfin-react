CREATE TABLE `agent_anchor_lookups` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` text(21) NOT NULL,
	`anchor` text COLLATE NOCASE NOT NULL,
	`expense_id` text(21) NOT NULL,
	`target_field` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`text_hash` integer,
	CONSTRAINT `fk_agent_anchor_lookups_text_hash_texts_text_hash_fk` FOREIGN KEY (`text_hash`) REFERENCES `texts`(`text_hash`) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE `agent_expense_drafts` (
	`id` text(21) PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`agent_request_id` text(21) NOT NULL,
	`data` text NOT NULL,
	`confidence_score` real NOT NULL,
	`expense_id` text(21),
	`created_at` integer NOT NULL
);

CREATE TABLE `agent_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`agent_request_id` text(21) NOT NULL,
	`r2_path` text NOT NULL,
	`kind` text,
	`description` text,
	`metadata` text
);

CREATE TABLE `agent_requests` (
	`id` text(21) PRIMARY KEY,
	`user_id` text(21) NOT NULL,
	`account_ids` text,
	`category_ids` text,
	`custom_instruction` text,
	`latitude` real,
	`longitude` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`settled_at` integer,
	`image_count` integer,
	`draft_count` integer,
	`error_message` text
);

CREATE INDEX `idx_agent_anchor_lookups_user_field_anchor` ON `agent_anchor_lookups` (`user_id`,`target_field`,`anchor`);
CREATE INDEX `idx_agent_anchor_lookups_text` ON `agent_anchor_lookups` (`text_hash`,`target_field`);
CREATE INDEX `idx_agent_expense_drafts_user_id` ON `agent_expense_drafts` (`user_id`);
CREATE INDEX `idx_agent_expense_drafts_agent_request_id` ON `agent_expense_drafts` (`agent_request_id`);
CREATE INDEX `idx_agent_images_ar_id` ON `agent_images` (`agent_request_id`);
CREATE INDEX `idx_agent_requests_user_id` ON `agent_requests` (`user_id`);