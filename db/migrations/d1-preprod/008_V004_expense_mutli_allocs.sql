CREATE TABLE `expense_account_allocs` (
	`expense_id` text(21) NOT NULL,
	`account_id` text(21) NOT NULL,
	`amount_cents` integer NOT NULL,
	`sequence` integer NOT NULL,
	`expense_billed_at` integer NOT NULL,
	CONSTRAINT `expense_account_allocs_pk` PRIMARY KEY(`expense_id`, `account_id`)
);

CREATE TABLE `expense_category_allocs` (
	`expense_id` text(21) NOT NULL,
	`category_id` text(21) NOT NULL,
	`amount_cents` integer NOT NULL,
	`sequence` integer NOT NULL,
	`expense_billed_at` integer NOT NULL,
	CONSTRAINT `expense_category_allocs_pk` PRIMARY KEY(`expense_id`, `category_id`)
);

CREATE INDEX `idx_expense_account_account_id` ON `expense_account_allocs` (`account_id`,`expense_billed_at`);
CREATE INDEX `idx_expense_category_category_id` ON `expense_category_allocs` (`category_id`,`expense_billed_at`);

insert into expense_account_allocs (expense_id, account_id, amount_cents, sequence, expense_billed_at)
select id, coalesce(account_id, ''), amount_cents, 0 as sequence, billed_at 
from expenses
where true
on conflict (expense_id, account_id)
do update set amount_cents = excluded.amount_cents, expense_billed_at = excluded.expense_billed_at;

insert into expense_category_allocs (expense_id, category_id, amount_cents, sequence, expense_billed_at)
select id, coalesce(category_id, ''), amount_cents, 0 as sequence, billed_at 
from expenses
where true
on conflict (expense_id, category_id)
do update set amount_cents = excluded.amount_cents, expense_billed_at = excluded.expense_billed_at;

update expense_items
set category_id = expenses.category_id
from expenses
where expenses.id = expense_items.expense_id and expense_items.category_id is null;