import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, blob, integer, real } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';
import { PERIOD_TYPES_TUPLE, SUBJECT_TYPES_TUPLE } from './enum';

export const generateId = () => nanoid(8);
const nullableIdColumn = () => text({ length: 8 });
const idColumn = () => nullableIdColumn().notNull();
const versionColumn = () =>
  integer()
    .notNull()
    .default(sql`1`)
    .$onUpdate(() => sql`version + 1`);
const dateColumn = () => integer({ mode: 'timestamp' }).notNull();
const createdAtColumn = () => dateColumn().$default(() => new Date());
const updatedAtColumn = () => dateColumn().$onUpdate(() => new Date());
const centsColumn = () => integer().notNull().default(0);
const boolean = () => integer({ mode: 'boolean' });

const baseColumns = () => ({
  id: idColumn()
    .primaryKey()
    .$defaultFn(() => nanoid(8)),
  version: versionColumn(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export type BaseColumns = keyof ReturnType<typeof baseColumns>;

export const historiesTable = sqliteTable('histories', {
  id: text({ length: 16 })
    .primaryKey()
    .$defaultFn(() => nanoid(16)),
  tableName: text().notNull(),
  rowId: idColumn(),
  // Values extracted from source
  valuesWere: text({ mode: 'json' }).notNull(),
  versionWas: integer().notNull(),
  wasUpdatedAt: dateColumn(),
  wasUpdatedBy: nullableIdColumn().references(() => usersTable.id),
});

export const usersTable = sqliteTable('users', {
  ...baseColumns(),
  name: text(),
  passSalt: blob({ mode: 'buffer' }),
  passKey: blob({ mode: 'buffer' }),
  requireNewPassword: integer({ mode: 'boolean' }).default(true),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
  sessions: many(sessionsTable),
}));

export const sessionsTable = sqliteTable('sessions', {
  ...baseColumns(),
  token: text({ length: 16 }).notNull(),
  userId: idColumn().references(() => usersTable.id),
  lastUsedAt: dateColumn(),
  expiresAt: dateColumn(),
});

export const sessionRelations = relations(sessionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [sessionsTable.userId],
    references: [usersTable.id],
  }),
}));

export const accountsTable = sqliteTable('accounts', {
  ...baseColumns(),
  belongsToId: idColumn().references(() => usersTable.id),
  name: text().notNull(),
  description: text(),
  sequence: integer(),
  isDeleted: boolean().default(false),
});

export const categoriesTable = sqliteTable('categories', {
  ...baseColumns(),
  belongsToId: idColumn().references(() => usersTable.id),
  name: text().notNull(),
  description: text(),
  sequence: integer(),
  isDeleted: boolean().default(false),
});

export const expensesTable = sqliteTable('expenses', {
  ...baseColumns(),
  amountCents: centsColumn(),
  billedAt: dateColumn(),
  belongsToId: idColumn().references(() => usersTable.id),
  accountId: nullableIdColumn().references(() => accountsTable.id),
  categoryId: nullableIdColumn().references(() => categoriesTable.id),
  updatedBy: idColumn().references(() => usersTable.id),
  latitude: real(),
  longitude: real(),
  geoAccuracy: real(),
  shopName: text(),
  shopMall: text(),
  isDeleted: boolean().default(false),
});

export const expensesRelations = relations(expensesTable, ({ one, many }) => ({
  belongsTo: one(usersTable, {
    fields: [expensesTable.belongsToId],
    references: [usersTable.id],
  }),
  account: one(accountsTable, {
    fields: [expensesTable.accountId],
    references: [accountsTable.id],
  }),
  category: one(categoriesTable, {
    fields: [expensesTable.categoryId],
    references: [categoriesTable.id],
  }),
  items: many(expenseItemsTable),
}));

export const expenseItemsTable = sqliteTable('expense_items', {
  ...baseColumns(),
  sequence: integer().notNull(),
  name: text().notNull(),
  quantity: integer().default(1).notNull(),
  priceCents: centsColumn(),
  expenseId: idColumn().references(() => expensesTable.id),
  categoryId: nullableIdColumn().references(() => categoriesTable.id),
  isDeleted: boolean().default(false),
});

export const expenseItemsRelations = relations(expenseItemsTable, ({ one }) => ({
  expense: one(expensesTable, {
    fields: [expenseItemsTable.expenseId],
    references: [expensesTable.id],
  }),
  category: one(categoriesTable, {
    fields: [expenseItemsTable.categoryId],
    references: [categoriesTable.id],
  }),
}));
