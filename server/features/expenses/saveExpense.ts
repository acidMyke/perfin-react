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
  expenseTextsTable,
  generateId,
} from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { getLocationBoxId } from '#server/lib/utils';
import { calculateExpense } from '#server/lib/expenseHelper';

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

export async function processSaveExpense(context: ProtectedContext, input: SaveExpenseInput) {
  const { user, db } = context;
  const userId = user.id;
  let expenseId = input.expenseId;
  const extgItemIds = new Set<string>();
  const extgAdjustmentIds = new Set<string>();
  const extgSearchTextHash = new Set<number>();

  if (expenseId !== CREATE_ID) {
    await verifyExpenseVersion(db, userId, input.expenseId, input.version);
    await getExistingChildrenData(db, input.expenseId, extgSearchTextHash, extgItemIds, extgAdjustmentIds);
  } else {
    expenseId = generateId();
  }

  const collector = new BatchCollector();
  const { accountId, categoryId } = prepareAccountAndCategory(db, userId, input.account, input.category, collector);

  prepareMainExpenseRecord(db, userId, input, accountId, categoryId, collector);
  prepareExpenseItems(db, input.expenseId, input.items, extgItemIds, collector);
  prepareExpenseAdjustments(db, input.expenseId, input.adjustments, extgAdjustmentIds, collector);

  await prepareSearchIndexes(db, userId, input, extgSearchTextHash, collector);

  collector.executeBatch(db, true);
}

export async function verifyExpenseVersion(db: AppDatabase, userId: string, expenseId: string, inputVersion: number) {
  const extgExpense = await db.query.expensesTable.findFirst({
    where: { id: expenseId, userId },
    columns: { userId: true, isDeleted: true, version: true, shopName: true, shopMall: true },
  });

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
  extgSearchTextHash: Set<number>,
  extgItemIds: Set<string>,
  extgAdjustmentIds: Set<string>,
) {
  const [items, adjustments, textHashes] = await db.batch([
    db
      .select({ id: expenseItemsTable.id })
      .from(expenseItemsTable)
      .where(and(eq(expenseItemsTable.expenseId, expenseId), eq(expenseItemsTable.isDeleted, false))),
    db
      .select({ id: expenseAdjustmentsTable.id })
      .from(expenseAdjustmentsTable)
      .where(and(eq(expenseAdjustmentsTable.expenseId, expenseId), eq(expenseAdjustmentsTable.isDeleted, false))),
    db
      .select({ textHash: expenseTextsTable.textHash })
      .from(expenseTextsTable)
      .where(eq(expenseTextsTable.expenseId, expenseId)),
  ]);

  for (const { id } of items) {
    extgItemIds.add(id);
  }

  for (const { id } of adjustments) {
    extgAdjustmentIds.add(id);
  }

  for (const { textHash } of textHashes) {
    extgSearchTextHash.add(textHash);
  }

  return { extgItemIds, extgAdjustmentIds, extgSearchTextHash };
}

type AccountInput = SaveExpenseInput['account'];
type CategoryInput = SaveExpenseInput['category'];

export function prepareAccountAndCategory(
  db: AppDatabase,
  userId: string,
  accountInput: AccountInput,
  categoryInput: CategoryInput,
  collector: BatchCollector,
) {
  let accountId: string | null = null;
  let categoryId: string | null = null;

  if (accountInput?.value === CREATE_ID) {
    accountId = generateId();
    collector.push(db.insert(accountsTable).values({ id: accountId, name: accountInput.label, userId: userId }));
  }

  if (categoryInput?.value === CREATE_ID) {
    categoryId = generateId();
    collector.push(db.insert(categoriesTable).values({ id: categoryId, name: categoryInput.label, userId: userId }));
  }

  return { accountId, categoryId };
}

export function prepareMainExpenseRecord(
  db: AppDatabase,
  userId: string,
  input: SaveExpenseInput,
  accountId: string | null,
  categoryId: string | null,
  collector: BatchCollector,
) {
  const { netTotalCents } = calculateExpense(input);
  const [boxId] =
    input.latitude && input.longitude
      ? getLocationBoxId({ latitude: input.latitude, longitude: input.longitude })
      : [null];

  collector.push(
    db
      .insert(expensesTable)
      .values({
        id: input.expenseId,
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
      })
      .onConflictDoUpdate({
        target: expensesTable.id,
        set: excludedAll(expensesTable, ['userId']),
      }),
  );
}
