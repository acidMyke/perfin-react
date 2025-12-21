PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_passkeys` (
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text(21) NOT NULL,
	`public_key` blob NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_passkeys`("created_at", "last_used_at", "id", "user_id", "public_key", "counter", "device_type", "backed_up", "transports") SELECT "created_at", "last_used_at", "id", "user_id", "public_key", "counter", "device_type", "backed_up", "transports" FROM `passkeys`;--> statement-breakpoint
DROP TABLE `passkeys`;--> statement-breakpoint
ALTER TABLE `__new_passkeys` RENAME TO `passkeys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;