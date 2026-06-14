ALTER TABLE `search_index_versions` ADD `records_processed` integer DEFAULT 0 NOT NULL;
ALTER TABLE `user_devices` ADD `show_notification` integer;
ALTER TABLE `user_devices` ADD `push_endpoint` text;
ALTER TABLE `user_devices` ADD `push_p256dh` text;
ALTER TABLE `user_devices` ADD `push_auth` text;