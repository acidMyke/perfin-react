import { sql, relations } from 'drizzle-orm';
import { sqliteTable, text, blob, integer } from 'drizzle-orm/sqlite-core';
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

const baseColumns = () => ({
  id: idColumn()
    .primaryKey()
    .$defaultFn(() => nanoid(8)),
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
  failedAttempts: integer(),
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

export const SUBJECT_TYPE = {
  ACCOUNT: 'account',
  CATEGORY: 'category',
} as const;

export const subjectsTable = sqliteTable('ledger_subjects', {
  ...baseColumns(),
  type: text({ enum: [SUBJECT_TYPE.ACCOUNT, SUBJECT_TYPE.CATEGORY] }).notNull(),
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

export const LEDGER_TYPES = {
  FULL: 'full',
  YEAR: 'year',
  MONTH: 'month',
  WEEK: 'week',
} as const;

export const ledgersTable = sqliteTable('ledgers', {
  ...baseColumns(),
  totalCents: centsColumn(),
  creditCents: centsColumn(),
  debitCents: centsColumn(),
  type: text({ enum: [LEDGER_TYPES.FULL, LEDGER_TYPES.YEAR, LEDGER_TYPES.MONTH, LEDGER_TYPES.WEEK] }).notNull(),
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
