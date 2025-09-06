PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ledgers` (
	`id` text(8) PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`credit_cents` integer DEFAULT 0 NOT NULL,
	`debit_cents` integer DEFAULT 0 NOT NULL,
	`date_from` integer NOT NULL,
	`date_to` integer,
	`for_subject_id` text(8),
	`is_dirty` integer DEFAULT true NOT NULL,
	`belongs_to_id` text(8) NOT NULL,
	FOREIGN KEY (`for_subject_id`) REFERENCES `ledger_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`belongs_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_ledgers`("id", "version", "created_at", "updated_at", "total_cents", "credit_cents", "debit_cents", "date_from", "date_to", "for_subject_id", "is_dirty", "belongs_to_id") SELECT "id", "version", "created_at", "updated_at", "total_cents", "credit_cents", "debit_cents", "date_from", "date_to", "for_subject_id", "is_dirty", "belongs_to_id" FROM `ledgers`;--> statement-breakpoint
DROP TABLE `ledgers`;--> statement-breakpoint
ALTER TABLE `__new_ledgers` RENAME TO `ledgers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ledgers_unique_idx` ON `ledgers` (`belongs_to_id`,`for_subject_id`,`date_from`,`date_to`);