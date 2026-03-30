import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  blob,
  integer,
  real,
  primaryKey,
  index,
  customType,
  unique,
  type ReferenceConfig,
} from 'drizzle-orm/sqlite-core';
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
const citext = customType<{ data: string }>({
  dataType() {
    return 'text COLLATE NOCASE';
  },
});

const baseColumns = () => ({
  id: pkIdColumn(),
  version: versionColumn(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export type BaseColumns = keyof ReturnType<typeof baseColumns>;

export const emailCodesTable = sqliteTable(
  'email_codes',
  {
    ...baseColumns(),
    email: citext().notNull(),
    code: text({ length: 6 }).notNull(),
    purpose: text().notNull(),
    validUntil: dateColumn(),
  },
  t => [index('idx_email_codes_code').on(t.code), index('idx_email_codes_email_valid_until').on(t.email, t.validUntil)],
);

export const loginAttemptsTable = sqliteTable(
  'login_attempts',
  {
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
  },
  t => [
    index('idx_login_attempts_ip_time').on(t.ip, t.timestamp),
    index('idx_login_attempts_user_time').on(t.attemptedForId, t.timestamp),
  ],
);

export const usersTable = sqliteTable('users', {
  ...baseColumns(),
  name: citext().unique().notNull(),
  email: citext().unique().notNull(),
  passSalt: blob({ mode: 'buffer' }).notNull(),
  passDigest: blob({ mode: 'buffer' }).notNull(),
  failedAttempts: integer().notNull().default(0),
  releasedAfter: integer({ mode: 'timestamp' }),
});

export const passkeysTable = sqliteTable(
  'passkeys',
  {
    createdAt: createdAtColumn(),
    lastUsedAt: dateColumn()
      .notNull()
      .$default(() => new Date()),
    id: text().primaryKey(),
    userId: idColumn(),
    publicKey: blob({ mode: 'buffer' }).notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull().$type<CredentialDeviceType>(),
    backedUp: boolean().notNull(),
    transports: text({ mode: 'json' }).notNull().$type<AuthenticatorTransportFuture[]>().default([]),
    nickname: text(),
  },
  t => [index('idx_passkeys_user_id').on(t.userId)],
);

export const sessionsTable = sqliteTable(
  'sessions',
  {
    ...baseColumns(),
    token: idColumn(),
    userId: idColumn(),
    lastUsedAt: dateColumn(),
    expiresAt: dateColumn(),
    loginAttemptId: idColumn(),
  },
  t => [
    index('idx_sessions_token_expires').on(t.token, t.expiresAt),
    index('idx_sessions_user_expires').on(t.userId, t.expiresAt),
  ],
);

export const accountsTable = sqliteTable(
  'accounts',
  {
    ...baseColumns(),
    userId: idColumn(),
    name: text().notNull(),
    description: text(),
    sequence: integer(),
    isDeleted: boolean().notNull().default(false),
  },
  t => [index('idx_accounts_user_seq').on(t.userId, t.sequence, t.createdAt)],
);

export const categoriesTable = sqliteTable(
  'categories',
  {
    ...baseColumns(),
    userId: idColumn(),
    name: text().notNull(),
    description: text(),
    sequence: integer(),
    isDeleted: boolean().notNull().default(false),
  },
  t => [index('idx_categories_user_seq').on(t.userId, t.sequence, t.createdAt)],
);

export const expensesTable = sqliteTable(
  'expenses',
  {
    ...baseColumns(),
    amountCents: centsColumn(),
    specifiedAmountCents: centsColumn(),
    billedAt: dateColumn(),
    userId: idColumn(),
    accountId: nullableIdColumn(),
    categoryId: nullableIdColumn(),
    type: text({ enum: ['online', 'physical'] }).notNull(),
    updatedBy: idColumn(),
    latitude: real(),
    longitude: real(),
    geoAccuracy: real(),
    /** @deprecated formula changed, replaced by geoId */
    boxId: integer(),
    geoId: integer(),
    shopName: citext(),
    shopMall: citext(),
    /** @deprecated normalized to expenseAdjustmentsTable*/
    additionalServiceChargePercent: integer(),
    /** @deprecated normalized to expenseAdjustmentsTable*/
    isGstExcluded: boolean(),
    isDeleted: boolean().notNull().default(false),
  },
  t => [
    index('idx_expenses_user_box_id').on(t.userId, t.boxId),
    index('idx_expenses_user_billed').on(t.userId, t.billedAt, t.isDeleted),
  ],
);

export const expenseItemsTable = sqliteTable(
  'expense_items',
  {
    ...baseColumns(),
    sequence: integer().notNull(),
    name: citext().notNull(),
    quantity: integer().default(1).notNull(),
    priceCents: centsColumn(),
    expenseId: idColumn(),
    /** @deprecated unused, will be deleted */
    categoryId: nullableIdColumn(),
    /** @deprecated refund is deprecated */
    expenseRefundId: nullableIdColumn(),
    isDeleted: boolean().notNull().default(false),
  },
  t => [index('idx_expense_items_expense_id').on(t.expenseId)],
);

/** @deprecated use expenseAdjustmentsTable instead*/
export const expenseRefundsTable = sqliteTable(
  'expense_refunds',
  {
    ...baseColumns(),
    expenseId: idColumn(),
    expenseItemId: nullableIdColumn(),
    expectedAmountCents: centsColumn(),
    actualAmountCents: integer(),
    confirmedAt: integer({ mode: 'timestamp' }),
    source: citext().notNull(),
    note: text(),
    sequence: integer().notNull(),
    isDeleted: boolean().notNull().default(false),
  },
  t => [
    index('idx_expense_refund_expense_id').on(t.expenseId),
    index('idx_expense_refund_expense_item_id').on(t.expenseItemId),
    index('idx_expense_refund_source').on(t.source),
  ],
);

export const expenseAdjustmentsTable = sqliteTable(
  'expense_adjustments',
  {
    ...baseColumns(),
    sequence: integer().notNull(),
    name: citext().notNull(),
    amountCents: integer('amount_cents').notNull(),
    rateBps: integer('rate_bps'),
    expenseId: idColumn(),
    expenseItemId: nullableIdColumn(),
    isDeleted: boolean().notNull().default(false),
    isInferable: boolean().notNull().default(false),
  },
  t => [
    index('idx_expense_adjustments_expense_id').on(t.expenseId),
    index('idx_expense_adjustments_inferrable')
      .on(t.expenseId, t.name, t.rateBps)
      .where(sql`${t.isInferable} = 1`),
  ],
);

/** @deprecated replaced by v2_search */
export const searchTable = sqliteTable(
  'search',
  {
    chunk: text().notNull(),
    text: citext().notNull(),
    type: text().notNull(),
    userId: idColumn(),
    usageCount: integer().default(1),
    context: citext().notNull().default(''),
  },
  t => [
    primaryKey({ columns: [t.chunk, t.text, t.type, t.userId, t.context] }),
    index('idx_search_chunk').on(t.userId, t.type, t.chunk),
    index('idx_search_context').on(t.userId, t.type, t.context),
  ],
);

export const textsTable = sqliteTable(
  'texts',
  {
    textHash: integer().primaryKey({ onConflict: 'ignore' }),
    userId: idColumn(),
    text: text().notNull(),
  },
  t => [unique('uq_texts_userId').on(t.userId, t.text)],
);

const textHashColumn = ({ onDelete = 'cascade', onUpdate = 'cascade' }: ReferenceConfig['actions'] = {}) =>
  integer()
    .notNull()
    .references(() => textsTable.textHash, { onDelete, onUpdate });

export const textChunksTable = sqliteTable(
  'texts_chunks',
  {
    userId: idColumn(),
    /** Use getTrigrams() to create chunks for texts*/
    chunk: text().notNull(),
    /** Use getTextHash() to calculate this value */
    textHash: textHashColumn(),
  },
  t => [
    // textHash includes userId in hashing
    primaryKey({ columns: [t.textHash, t.chunk] }),
    // covering index to quickly lookup textHash with provided userId & chunk
    index('idx_user_chunks').on(t.userId, t.chunk, t.textHash),
  ],
);

export const textsContextsTable = sqliteTable(
  'texts_contexts',
  {
    textHash: textHashColumn(),
    ctxTextHash: textHashColumn(),
  },
  t => [
    primaryKey({ columns: [t.textHash, t.ctxTextHash] }),
    index('idx_texts_contexts_ctxTextHash_textHash').on(t.ctxTextHash, t.textHash),
  ],
);

export const geoTextsTable = sqliteTable(
  'geo_texts',
  {
    userId: idColumn(),
    geoId: integer().notNull(),
    textHash: textHashColumn(),
    latitude: real().notNull(),
    longitude: real().notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.geoId, t.textHash] })],
);

export const expenseTextsTable = sqliteTable(
  'expenses_texts',
  {
    expenseId: idColumn(),
    /** Use getTextHash() to calculate this value */
    textHash: textHashColumn(),
    /** Can be expensesTable.id, expenseItemsTable.id, expenseAdjustmentsTable.id */
    sourceId: idColumn(),
  },
  t => [
    primaryKey({ columns: [t.textHash, t.sourceId] }),
    index('idx_expenses_texts_sourceId').on(t.sourceId),
    index('idx_textHash_expenseId').on(t.textHash, t.expenseId),
  ],
);
