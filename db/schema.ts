import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, blob, integer, real } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const generateId = () => nanoid();
const nullableIdColumn = () => text({ length: 21 });
const idColumn = () => nullableIdColumn().notNull();
const pkIdColumn = () =>
  nullableIdColumn()
    .primaryKey()
    .$defaultFn(() => generateId());
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
  id: pkIdColumn(),
  version: versionColumn(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export type BaseColumns = keyof ReturnType<typeof baseColumns>;

export const historiesTable = sqliteTable('histories', {
  id: pkIdColumn(),
  tableName: text().notNull(),
  rowId: idColumn(),
  // Values extracted from source
  valuesWere: text({ mode: 'json' }).notNull(),
  versionWas: integer().notNull(),
  wasUpdatedAt: dateColumn(),
  wasUpdatedBy: nullableIdColumn(),
});

export const emailCodesTable = sqliteTable('email_codes', {
  ...baseColumns(),
  email: text().notNull(),
  code: text({ length: 16 }).notNull(),
  purpose: text().notNull(),
  validUntil: dateColumn(),
});

export const loginAttemptsTable = sqliteTable('login_attempts', {
  id: pkIdColumn(),
  timestamp: createdAtColumn(),
  attemptedForId: nullableIdColumn(),
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
  passSalt: blob({ mode: 'buffer' }).notNull(),
  passDigest: blob({ mode: 'buffer' }).notNull(),
  failedAttempts: integer().notNull().default(0),
  releasedAfter: integer({ mode: 'timestamp' }),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
  sessions: many(sessionsTable),
  passkeys: many(passkeysTable),
}));

export const passkeysTable = sqliteTable('passkeys', {
  id: text().primaryKey(),
  userId: idColumn(),
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
  userId: idColumn(),
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

export const fileRequestsTable = sqliteTable('file_requests', {
  ...baseColumns(),
  userId: idColumn(),
  sessionId: idColumn(),
  method: text({ enum: ['GET', 'PUT'] }).notNull(),
  contentType: text(),
  filePath: text().notNull(),
  putState: text({ enum: ['INITIAL', 'UNUSED', 'VERFIED'] }),
});

export const accountsTable = sqliteTable('accounts', {
  ...baseColumns(),
  belongsToId: idColumn(),
  name: text().notNull(),
  description: text(),
  sequence: integer(),
  isDeleted: boolean().notNull().default(false),
});

export const categoriesTable = sqliteTable('categories', {
  ...baseColumns(),
  belongsToId: idColumn(),
  name: text().notNull(),
  description: text(),
  sequence: integer(),
  isDeleted: boolean().notNull().default(false),
});

export const expensesTable = sqliteTable('expenses', {
  ...baseColumns(),
  amountCents: centsColumn(),
  amountCentsPreRefund: centsColumn(),
  billedAt: dateColumn(),
  belongsToId: idColumn(),
  accountId: nullableIdColumn(),
  categoryId: nullableIdColumn(),
  updatedBy: idColumn(),
  latitude: real(),
  longitude: real(),
  geoAccuracy: real(),
  shopName: text(),
  shopMall: text(),
  additionalServiceChargePercent: integer(),
  isGstExcluded: boolean(),
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
  refunds: many(expenseRefundsTable),
  attachments: many(expenseAttachmentsTable),
}));

export const expenseItemsTable = sqliteTable('expense_items', {
  ...baseColumns(),
  sequence: integer().notNull(),
  name: text().notNull(),
  quantity: integer().default(1).notNull(),
  priceCents: centsColumn(),
  expenseId: idColumn(),
  categoryId: nullableIdColumn(),
  expenseRefundId: nullableIdColumn(),
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
  expenseRefund: one(expenseRefundsTable, {
    fields: [expenseItemsTable.expenseRefundId],
    references: [expenseRefundsTable.id],
  }),
}));

export const expenseRefundsTable = sqliteTable('expense_refunds', {
  ...baseColumns(),
  expenseId: idColumn(),
  expenseItemId: nullableIdColumn(),
  expectedAmountCents: centsColumn(),
  actualAmountCents: integer(),
  confirmedAt: integer({ mode: 'timestamp' }),
  source: text().notNull(),
  note: text(),
  sequence: integer().notNull(),
  isDeleted: boolean().notNull().default(false),
});

export const expenseRefundsRelations = relations(expenseRefundsTable, ({ one }) => ({
  expense: one(expensesTable, {
    fields: [expenseRefundsTable.expenseId],
    references: [expensesTable.id],
  }),
  expenseItem: one(expenseItemsTable, {
    fields: [expenseRefundsTable.expenseItemId],
    references: [expenseItemsTable.id],
  }),
}));

export const expenseAttachmentsTable = sqliteTable('expense_attachments', {
  ...baseColumns(),
  expenseId: idColumn(),
  uploadRequestId: idColumn(),

  type: text().notNull(),
  sequence: integer().notNull(),
  isDeleted: boolean().notNull().default(false),
});

export const expenseAttachmentsRelations = relations(expenseAttachmentsTable, ({ one }) => ({
  expense: one(expensesTable, {
    fields: [expenseAttachmentsTable.expenseId],
    references: [expensesTable.id],
  }),
  uploadRequest: one(fileRequestsTable, {
    fields: [expenseAttachmentsTable.uploadRequestId],
    references: [fileRequestsTable.id],
  }),
}));
