import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, blob, integer } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const generateId = () => nanoid(8);
const nullableIdColumn = () => text({ length: 8 });
const idColumn = () =>
  nullableIdColumn()
    .notNull()
    .$defaultFn(() => nanoid(8));
const versionColumn = (colName = `version`) =>
  integer(colName)
    .notNull()
    .default(sql`1`)
    .$onUpdate(() => sql`${colName} + 1`);
const dateColumn = () => integer({ mode: 'timestamp' }).notNull();
const createdAtColumn = () => dateColumn().default(sql`(CURRENT_TIMESTAMP)`);
const updatedAtColumn = () => dateColumn().$onUpdate(() => new Date());
const centsColumn = () => integer().notNull().default(0);

const baseColumns = () => ({
  id: idColumn(),
  version: versionColumn(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const usersTable = sqliteTable('users', {
  ...baseColumns(),
  name: text(),
  passSalt: blob({ mode: 'buffer' }),
  passKey: blob({ mode: 'buffer' }),
  requireNewPassword: integer({ mode: 'boolean' }).default(true),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
  accounts: many(accountsTable),
}));

export const accountsTable = sqliteTable('accounts', {
  ...baseColumns(),
  belongsToId: idColumn().references(() => usersTable.id),
});

export const accountsRelations = relations(accountsTable, ({ one, many }) => ({
  belongsTo: one(usersTable, {
    fields: [accountsTable.belongsToId],
    references: [usersTable.id],
  }),
  ledgers: many(ledgersTable),
  transactions: many(transactionsTable),
}));

export const LEDGER_TYPES = {
  YEAR: 'year',
  MONTH: 'month',
  WEEK: 'week',
} as const;

export const ledgersTable = sqliteTable('ledgers', {
  ...baseColumns(),
  totalCents: centsColumn(),
  creditCents: centsColumn(),
  debitCents: centsColumn(),
  type: text({ enum: [LEDGER_TYPES.YEAR, LEDGER_TYPES.MONTH, LEDGER_TYPES.WEEK] }),
  accountId: nullableIdColumn().references(() => accountsTable.id),
});

export const ledgersRelations = relations(ledgersTable, ({ one }) => ({
  account: one(accountsTable, {
    fields: [ledgersTable.accountId],
    references: [accountsTable.id],
  }),
}));

export const transactionsTable = sqliteTable('transactions', {
  ...baseColumns(),
  amountCents: centsColumn(),
  effectiveAt: dateColumn(),
  accountId: idColumn().references(() => accountsTable.id),
});

export const transactionsRelations = relations(transactionsTable, ({ one }) => ({
  account: one(accountsTable, {
    fields: [transactionsTable.accountId],
    references: [accountsTable.id],
  }),
}));
