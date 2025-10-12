import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, blob, integer, real } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

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

export const emailCodesTable = sqliteTable('email_codes', {
  ...baseColumns(),
  email: text().notNull(),
  emailCode: text({ length: 16 }).notNull(),
  requestType: text().notNull(),
  validUntil: dateColumn(),
  userId: nullableIdColumn(), // Null for sign up
});

export const loginAttemptsTable = sqliteTable('login_attempts', {
  id: text({ length: 16 })
    .primaryKey()
    .$defaultFn(() => nanoid(16)),
  timestamp: createdAtColumn(),
  attemptedForId: nullableIdColumn().references(() => usersTable.id),
  isSuccess: integer({ mode: 'boolean' }).notNull(),

  ip: text().notNull(),
  asn: integer(),
  city: text(),
  region: text(),
  country: text({ length: 2 }),
  colo: text({ length: 3 }),
  userAgent: text(),
});

export const loginAttemptsRelations = relations(loginAttemptsTable, ({ one, many }) => ({
  attemptedFor: one(usersTable, {
    fields: [loginAttemptsTable.attemptedForId],
    references: [usersTable.id],
  }),
  session: many(sessionsTable),
}));

export const usersTable = sqliteTable('users', {
  ...baseColumns(),
  name: text().unique().notNull(),
  email: text().unique().notNull(),
  passSalt: blob({ mode: 'buffer' }),
  passKey: blob({ mode: 'buffer' }),
  failedAttempts: integer().notNull().default(0),
  releasedAfter: integer({ mode: 'timestamp' }),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
  sessions: many(sessionsTable),
  passkeys: many(passkeysTable),
}));

export const passkeysTable = sqliteTable('passkeys', {
  id: text().primaryKey(),
  userId: idColumn().references(() => usersTable.id),
  publicKey: blob({ mode: 'buffer' }),
  signCount: integer().notNull(),
  challenge: text(),
  challengedAt: integer({ mode: 'timestamp' }),
  createdAt: createdAtColumn(),
});

export const passkeysRelations = relations(passkeysTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [passkeysTable.userId],
    references: [usersTable.id],
  }),
}));

export const sessionsTable = sqliteTable('sessions', {
  ...baseColumns(),
  token: text({ length: 16 }).notNull(),
  userId: idColumn().references(() => usersTable.id),
  lastUsedAt: dateColumn(),
  expiresAt: dateColumn(),
  loginAttemptId: idColumn(),
});

export const sessionRelations = relations(sessionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [sessionsTable.userId],
    references: [usersTable.id],
  }),
  loginAttempts: one(loginAttemptsTable, {
    fields: [sessionsTable.loginAttemptId],
    references: [loginAttemptsTable.id],
  }),
}));

export const accountsTable = sqliteTable('accounts', {
  ...baseColumns(),
  belongsToId: idColumn().references(() => usersTable.id),
  name: text().notNull(),
  description: text(),
  sequence: integer(),
  isDeleted: boolean().notNull().default(false),
});

export const categoriesTable = sqliteTable('categories', {
  ...baseColumns(),
  belongsToId: idColumn().references(() => usersTable.id),
  name: text().notNull(),
  description: text(),
  sequence: integer(),
  isDeleted: boolean().notNull().default(false),
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
  isDeleted: boolean().notNull().default(false),
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
  isDeleted: boolean().notNull().default(false),
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
