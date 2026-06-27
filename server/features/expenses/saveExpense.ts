import { excludedAll, BatchCollector, type AppDatabase } from '#server/lib/db';
import type { ProtectedContext } from '#server/lib/trpc';
import { parseISO } from 'date-fns';
import z from 'zod';
import {
  accountsTable,
  categoriesTable,
  expenseAdjustmentsTable,
  expenseItemsTable,
  expensesTable,
  generateId,
} from '#schema';
import { and, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { getLocationBoxId } from '#server/lib/utils';
import { calculateExpense } from '#server/lib/expenseHelper';
import { processSaveExpenseSearchIndexing } from './indexing';

export const saveExpenseInputSchema = z.object({
  expenseId: z.string(),
  version: z.int().optional().default(0),
  billedAt: z.iso.datetime({ error: 'Invalid date time' }).transform(val => parseISO(val)),
  account: z
    .object({ value: z.string(), label: z.string().trim() })
    .nullish()
    .transform(v => v ?? null),
  category: z
    .object({ value: z.string(), label: z.string().trim() })
    .nullish()
    .transform(v => v ?? null),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  geoAccuracy: z.number().nullish(),
  shopName: z
    .string()
    .trim()
    .nullish()
    .transform(v => (v ? v : null)),
  shopMall: z
    .string()
    .trim()
    .nullish()
    .transform(v => (v ? v : null)),
  type: z.enum(['online', 'physical']),
  specifiedAmountCents: z.int().min(0, { error: 'Must be non-negative value' }),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string().trim(),
      priceCents: z.int().min(0, { error: 'Must be non-negative value' }),
      quantity: z.int().min(0, { error: 'Must be non-negative value' }),
      isDeleted: z.boolean().optional().default(false),
    }),
  ),
  adjustments: z.array(
    z.object({
      id: z.string(),
      name: z.string().trim(),
      amountCents: z.int().default(0),
      rateBps: z
        .int()
        .nullish()
        .transform(v => v ?? undefined),
      expenseItemId: z
        .string()
        .nullish()
        .transform(v => v ?? undefined),
      isDeleted: z.boolean().optional().default(false),
    }),
  ),
});

const CREATE_ID = 'create' as const;
type SaveExpenseInput = z.infer<typeof saveExpenseInputSchema>;

export const saveExpenseRepo = {
  getExtgExpense: (db: AppDatabase, expenseId: string, userId: string) =>
    db.query.expensesTable.findFirst({
      where: { id: expenseId, userId },
      columns: { userId: true, isDeleted: true, version: true, shopName: true, shopMall: true },
    }),
  getExtgExpenseChildrenIds: (db: AppDatabase, expenseId: string) =>
    db.batch([
      db
        .select({ id: expenseItemsTable.id })
        .from(expenseItemsTable)
        .where(and(eq(expenseItemsTable.expenseId, expenseId), eq(expenseItemsTable.isDeleted, false))),
      db
        .select({ id: expenseAdjustmentsTable.id })
        .from(expenseAdjustmentsTable)
        .where(and(eq(expenseAdjustmentsTable.expenseId, expenseId), eq(expenseAdjustmentsTable.isDeleted, false))),
    ]),
  insertSubject: (
    db: AppDatabase,
    table: typeof accountsTable | typeof categoriesTable,
    id: string,
    name: string,
    userId: string,
  ) => db.insert(table).values({ id, name, userId }),
  upsertMainExpense: (db: AppDatabase, value: typeof expensesTable.$inferInsert) =>
    db
      .insert(expensesTable)
      .values(value)
      .onConflictDoUpdate({ target: expensesTable.id, set: excludedAll(expensesTable, ['userId']) }),
  upsertExpenseItems: (db: AppDatabase, itemsRecords: (typeof expenseItemsTable.$inferInsert)[]) =>
    db
      .insert(expenseItemsTable)
      .values(itemsRecords)
      .onConflictDoUpdate({
        target: expenseItemsTable.id,
        set: excludedAll(expenseItemsTable),
      }),
  upsertExpenseAdjustments: (db: AppDatabase, adjustmentsRecords: (typeof expenseAdjustmentsTable.$inferInsert)[]) =>
    db
      .insert(expenseAdjustmentsTable)
      .values(adjustmentsRecords)
      .onConflictDoUpdate({
        target: expenseAdjustmentsTable.id,
        set: excludedAll(expenseAdjustmentsTable),
      }),
  markExpenseChildAsDeleted: (
    db: AppDatabase,
    table: typeof expenseItemsTable | typeof expenseAdjustmentsTable,
    expenseId: string,
    ids: Iterable<string>,
  ) =>
    db
      .update(table)
      .set({ isDeleted: true })
      .where(and(eq(table.expenseId, expenseId), inArray(table.id, Array.from(ids)))),
};

export type SaveExpenseRepo = typeof saveExpenseRepo;
type PickRepos<TName extends keyof SaveExpenseRepo> = Pick<SaveExpenseRepo, TName>;

const saveExpenseHelpers = {
  verifyExpenseVersion,
  getExistingChildrenData,
  queueMainExpenseRecord,
  queueExpenseItems,
  queueExpenseAdjustments,
};

export type SaveExpenseHelpers = typeof saveExpenseHelpers;

const allDeps = { ...saveExpenseRepo, ...saveExpenseHelpers };

export async function processSaveExpense(context: ProtectedContext, input: SaveExpenseInput, deps = allDeps) {
  const { user, db } = context;
  const userId = user.id;
  let expenseId = input.expenseId;
  const extgItemIds = new Set<string>();
  const extgAdjIds = new Set<string>();

  if (expenseId !== CREATE_ID) {
    await deps.verifyExpenseVersion(db, userId, expenseId, input.version, deps);
    await deps.getExistingChildrenData(db, expenseId, extgItemIds, extgAdjIds, deps);
  } else {
    expenseId = generateId();
  }

  const collector = new BatchCollector();
  deps.queueMainExpenseRecord(collector, db, userId, expenseId, input, deps);
  deps.queueExpenseItems(collector, db, expenseId, input.items, extgItemIds, deps);
  deps.queueExpenseAdjustments(collector, db, expenseId, input.adjustments, extgAdjIds, deps);
  await processSaveExpenseSearchIndexing(collector, db, { ...input, id: expenseId, userId });

  await collector.executeBatch(db, true);
}

export async function verifyExpenseVersion(
  db: AppDatabase,
  userId: string,
  expenseId: string,
  inputVersion: number,
  { getExtgExpense }: PickRepos<'getExtgExpense'> = saveExpenseRepo,
) {
  const extgExpense = await getExtgExpense(db, expenseId, userId);

  if (!extgExpense) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  if (extgExpense.version > inputVersion) {
    throw new TRPCError({ code: 'CONFLICT' });
  }

  return extgExpense;
}

export async function getExistingChildrenData(
  db: AppDatabase,
  expenseId: string,
  extgItemIds: Set<string>,
  extgAdjustmentIds: Set<string>,
  { getExtgExpenseChildrenIds }: PickRepos<'getExtgExpenseChildrenIds'> = saveExpenseRepo,
) {
  const [items, adjustments] = await getExtgExpenseChildrenIds(db, expenseId);

  for (const { id } of items) {
    extgItemIds.add(id);
  }

  for (const { id } of adjustments) {
    extgAdjustmentIds.add(id);
  }
}

export function queueMainExpenseRecord(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  expenseId: string,
  input: SaveExpenseInput,
  { insertSubject, upsertMainExpense }: PickRepos<'upsertMainExpense' | 'insertSubject'> = saveExpenseRepo,
) {
  const { netTotalCents } = calculateExpense(input);
  const [boxId] =
    input.latitude && input.longitude
      ? getLocationBoxId({ latitude: input.latitude, longitude: input.longitude })
      : [null];

  let accountId = input.account?.value ?? null;
  let categoryId = input.category?.value ?? null;

  if (input.account?.value === CREATE_ID) {
    accountId = generateId();
    collector.push(insertSubject(db, accountsTable, accountId, input.account.label, userId));
  }

  if (input.category?.value === CREATE_ID) {
    categoryId = generateId();
    collector.push(insertSubject(db, categoriesTable, categoryId, input.category.label, userId));
  }

  collector.push(
    upsertMainExpense(db, {
      id: expenseId,
      amountCents: netTotalCents,
      billedAt: input.billedAt,
      userId: userId,
      accountId: accountId,
      categoryId: categoryId,
      type: input.type,
      updatedBy: userId,
      latitude: input.latitude,
      longitude: input.longitude,
      geoAccuracy: input.geoAccuracy,
      boxId,
      shopName: input.shopName,
      shopMall: input.shopMall,
      specifiedAmountCents: input.specifiedAmountCents,
    }),
  );
}

export function queueExpenseItems(
  collector: BatchCollector,
  db: AppDatabase,
  expenseId: string,
  items: SaveExpenseInput['items'],
  extgItemIds: Set<string>,
  deps: PickRepos<'upsertExpenseItems' | 'markExpenseChildAsDeleted'> = saveExpenseRepo,
) {
  const itemsRecords: (typeof expenseItemsTable.$inferInsert)[] = [];
  const removedItemIds = new Set(extgItemIds);
  for (const item of items) {
    if (item.isDeleted) continue;
    if (item.id === CREATE_ID) item.id = generateId();
    removedItemIds.delete(item.id);
    itemsRecords.push({ ...item, expenseId, sequence: itemsRecords.length });
  }

  if (itemsRecords.length > 0) {
    collector.push(deps.upsertExpenseItems(db, itemsRecords));
  }

  if (removedItemIds.size > 0) {
    collector.push(deps.markExpenseChildAsDeleted(db, expenseItemsTable, expenseId, removedItemIds));
  }
}

export function queueExpenseAdjustments(
  collector: BatchCollector,
  db: AppDatabase,
  expenseId: string,
  adjustments: SaveExpenseInput['adjustments'],
  extgAdjustmentIds: Set<string>,
  deps: PickRepos<'upsertExpenseAdjustments' | 'markExpenseChildAsDeleted'> = saveExpenseRepo,
) {
  const adjustmentsRecords: (typeof expenseAdjustmentsTable.$inferInsert)[] = [];
  const removedAdjIds = new Set(extgAdjustmentIds);
  for (const adj of adjustments) {
    if (adj.isDeleted) continue;
    if (adj.id === CREATE_ID) adj.id = generateId();
    removedAdjIds.delete(adj.id);
    adjustmentsRecords.push({ ...adj, expenseId, sequence: adjustmentsRecords.length });
  }

  if (adjustmentsRecords.length > 0) {
    collector.push(deps.upsertExpenseAdjustments(db, adjustmentsRecords));
  }

  if (removedAdjIds.size > 0) {
    collector.push(deps.markExpenseChildAsDeleted(db, expenseAdjustmentsTable, expenseId, removedAdjIds));
  }
}
