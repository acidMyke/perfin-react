import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, blob, integer } from 'drizzle-orm/sqlite-core';
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
  failedAttempts: integer().notNull().default(0),
  releasedAfter: integer({ mode: 'timestamp' }),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
  subjects: many(subjectsTable),
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

export const subjectsTable = sqliteTable('ledger_subjects', {
  ...baseColumns(),
  type: text({ enum: SUBJECT_TYPES_TUPLE }).notNull(),
  belongsToId: idColumn().references(() => usersTable.id),
  name: text().notNull(),
  description: text(),
  sequence: integer(),
});

export const subjectsRelations = relations(subjectsTable, ({ one, many }) => ({
  belongsTo: one(usersTable, {
    fields: [subjectsTable.belongsToId],
    references: [usersTable.id],
  }),
  ledgers: many(ledgersTable),
  expenses: many(expensesTable),
}));

export const ledgersTable = sqliteTable('ledgers', {
  ...baseColumns(),
  totalCents: centsColumn(),
  creditCents: centsColumn(),
  debitCents: centsColumn(),
  type: text({ enum: PERIOD_TYPES_TUPLE }).notNull(),
  /** For ALL but FULL type ledgers */
  year: integer(),
  /** For MONTH type ledgers*/
  month: integer(),
  /** For WEEK type ledgers */
  week: integer(),
  forSubjectId: idColumn(),
});

export const ledgersRelations = relations(ledgersTable, ({ one }) => ({
  subject: one(subjectsTable, {
    fields: [ledgersTable.forSubjectId],
    references: [subjectsTable.id],
  }),
}));

export const expensesTable = sqliteTable('expenses', {
  ...baseColumns(),
  description: text(),
  amountCents: centsColumn(),
  billedAt: dateColumn(),
  belongsToId: idColumn().references(() => usersTable.id),
  accountId: nullableIdColumn().references(() => subjectsTable.id),
  categoryId: nullableIdColumn().references(() => subjectsTable.id),
  updatedBy: idColumn().references(() => usersTable.id),
});

export const expensesRelations = relations(expensesTable, ({ one }) => ({
  belongsTo: one(usersTable, {
    fields: [expensesTable.belongsToId],
    references: [usersTable.id],
  }),
  account: one(subjectsTable, {
    fields: [expensesTable.accountId],
    references: [subjectsTable.id],
  }),
  category: one(subjectsTable, {
    fields: [expensesTable.categoryId],
    references: [subjectsTable.id],
  }),
}));
