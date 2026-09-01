CREATE TABLE `expense_attachments` (
	`expense_id` text(21) NOT NULL,
	`file_id` text(21) NOT NULL,
	CONSTRAINT `expense_attachments_pk` PRIMARY KEY(`expense_id`, `file_id`)
);
