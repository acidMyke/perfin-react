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
  textChunksTable,
  textsContextsTable,
  textsTable,
} from '../../../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { getLocationBoxId, getTextsHashes, getTrigrams, splitArray } from '#server/lib/utils';
import { blacklistSearchableText, calculateExpense } from '#server/lib/expenseHelper';

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

  if (expenseId !== CREATE_ID) {
    await verifyExpenseVersion(db, userId, expenseId, input.version);
    await getExistingChildrenData(db, expenseId, extgItemIds, extgAdjustmentIds);
  } else {
    expenseId = generateId();
  }

  const collector = new BatchCollector();
  const { accountId, categoryId } = prepareQueueAccountCategory(collector, db, userId, input.account, input.category);
  queueMainExpenseRecord(collector, db, userId, expenseId, input, accountId, categoryId);
  queueExpenseItems(collector, db, expenseId, input.items, extgItemIds);
  queueExpenseAdjustments(collector, db, expenseId, input.adjustments, extgAdjustmentIds);
  await processSearchIndex(collector, db, userId, expenseId, input);

  await collector.executeBatch(db, true);
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
  extgItemIds: Set<string>,
  extgAdjustmentIds: Set<string>,
) {
  const [items, adjustments] = await db.batch([
    db
      .select({ id: expenseItemsTable.id })
      .from(expenseItemsTable)
      .where(and(eq(expenseItemsTable.expenseId, expenseId), eq(expenseItemsTable.isDeleted, false))),
    db
      .select({ id: expenseAdjustmentsTable.id })
      .from(expenseAdjustmentsTable)
      .where(and(eq(expenseAdjustmentsTable.expenseId, expenseId), eq(expenseAdjustmentsTable.isDeleted, false))),
  ]);

  for (const { id } of items) {
    extgItemIds.add(id);
  }

  for (const { id } of adjustments) {
    extgAdjustmentIds.add(id);
  }

  return { extgItemIds, extgAdjustmentIds };
}

export function prepareQueueAccountCategory(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  accountInput: SaveExpenseInput['account'],
  categoryInput: SaveExpenseInput['category'],
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

export function queueMainExpenseRecord(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  expenseId: string,
  input: SaveExpenseInput,
  accountId: string | null,
  categoryId: string | null,
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
      })
      .onConflictDoUpdate({
        target: expensesTable.id,
        set: excludedAll(expensesTable, ['userId']),
      }),
  );
}

export function queueExpenseItems(
  collector: BatchCollector,
  db: AppDatabase,
  expenseId: string,
  items: SaveExpenseInput['items'],
  extgItemIds: Set<string>,
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
    collector.push(
      db
        .insert(expenseItemsTable)
        .values(itemsRecords)
        .onConflictDoUpdate({
          target: expenseItemsTable.id,
          set: excludedAll(expenseItemsTable),
        }),
    );
  }

  if (removedItemIds.size > 0) {
    collector.push(
      db
        .update(expenseItemsTable)
        .set({ isDeleted: true })
        .where(
          and(eq(expenseItemsTable.expenseId, expenseId), inArray(expenseItemsTable.id, Array.from(removedItemIds))),
        ),
    );
  }
}

export function queueExpenseAdjustments(
  collector: BatchCollector,
  db: AppDatabase,
  expenseId: string,
  adjustments: SaveExpenseInput['adjustments'],
  extgAdjustmentIds: Set<string>,
) {
  const adjustmentsRecords: (typeof expenseAdjustmentsTable.$inferInsert)[] = [];
  const removedAdjustmentIds = new Set(extgAdjustmentIds);
  for (const adj of adjustments) {
    if (adj.isDeleted) continue;
    if (adj.id === CREATE_ID) adj.id = generateId();
    removedAdjustmentIds.delete(adj.id);
    adjustmentsRecords.push({ ...adj, expenseId, sequence: adjustmentsRecords.length });
  }

  if (adjustmentsRecords.length > 0) {
    collector.push(
      db
        .insert(expenseAdjustmentsTable)
        .values(adjustmentsRecords)
        .onConflictDoUpdate({
          target: expenseAdjustmentsTable.id,
          set: excludedAll(expenseAdjustmentsTable),
        }),
    );
  }

  if (removedAdjustmentIds.size > 0) {
    collector.push(
      db
        .update(expenseAdjustmentsTable)
        .set({ isDeleted: true })
        .where(
          and(
            eq(expenseAdjustmentsTable.expenseId, expenseId),
            inArray(expenseAdjustmentsTable.id, Array.from(removedAdjustmentIds)),
          ),
        ),
    );
  }
}

type SearchableInfo = { text: string; context?: string | null; sourceId: string };

export async function processSearchIndex(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  expenseId: string,
  input: SaveExpenseInput,
) {
  const inputSearchables: SearchableInfo[] = gatherInputSearchables(input, expenseId);

  const inputSearchableTexts = inputSearchables
    .map(({ text }) => text)
    .filter(text => !blacklistSearchableText.has(text));
  const inputSearchTextHashMapping = await getTextsHashes(userId, inputSearchableTexts);
  const inputSearchTextHash = new Set(inputSearchTextHashMapping.values());
  const { missingHash, extgHash, extgHashCtx } = await checkDbTextHashes(db, expenseId, inputSearchTextHash);

  const removedSearchTextHash = extgHash.difference(inputSearchTextHash);
  const newSearchTextHash = inputSearchTextHash.difference(extgHash);

  queueRemovedSearchables(collector, db, expenseId, removedSearchTextHash);
  queueNewSearchables(
    collector,
    db,
    userId,
    expenseId,
    inputSearchables,
    inputSearchTextHashMapping,
    newSearchTextHash,
    missingHash,
    extgHashCtx,
  );
}

function gatherInputSearchables(input: SaveExpenseInput, expenseId: string) {
  const inputSearchables: SearchableInfo[] = [];

  if (input.shopName) {
    inputSearchables.push({ text: input.shopName, context: input.shopMall, sourceId: expenseId });
  }

  if (input.shopMall) {
    inputSearchables.push({ text: input.shopMall, sourceId: expenseId });
  }

  for (const item of input.items) {
    if (item.isDeleted) continue;
    inputSearchables.push({ text: item.name, context: input.shopName, sourceId: item.id });
  }

  for (const adj of input.adjustments) {
    if (adj.isDeleted) continue;
    inputSearchables.push({ text: adj.name, context: input.shopName, sourceId: adj.id });
  }
  return inputSearchables;
}

export async function checkDbTextHashes(db: AppDatabase, expenseId: string, searchTextHashes: Set<number>) {
  const textHashesValues = sql.join(
    searchTextHashes
      .values()
      .map((hash, i) => (i === 0 ? sql`SELECT ${hash} AS hash` : sql`UNION ALL SELECT ${hash}`))
      .toArray(),
    sql` `,
  );

  const [missingRecords, textHashes] = await db.batch([
    db.select({ hash: sql<number>`sub.hash`.as('hash') }).from(
      sql`(SELECT q.hash FROM (${textHashesValues}) AS q
           LEFT JOIN ${textsTable} ON ${textsTable.textHash} = q.hash
           WHERE ${textsTable.textHash} IS NULL) AS sub`,
    ),
    db
      .select({ textHash: expenseTextsTable.textHash, ctxTextHash: textsContextsTable.ctxTextHash })
      .from(expenseTextsTable)
      .leftJoin(textsContextsTable, eq(expenseTextsTable.textHash, textsContextsTable.textHash))
      .where(eq(expenseTextsTable.expenseId, expenseId)),
  ]);

  const missingHash = new Set(missingRecords.map(({ hash }) => hash));
  const extgHash = new Set<number>();
  const extgHashCtx = new Map<number, Set<number>>();

  for (const { textHash, ctxTextHash } of textHashes) {
    extgHash.add(textHash);
    if (ctxTextHash) {
      if (extgHashCtx.has(textHash)) {
        extgHashCtx.get(textHash)!.add(ctxTextHash);
      } else {
        extgHashCtx.set(textHash, new Set([ctxTextHash]));
      }
    }
  }

  return { missingHash, extgHash, extgHashCtx };
}

function queueRemovedSearchables(
  collector: BatchCollector,
  db: AppDatabase,
  expenseId: string,
  removedSearchTextHash: Set<number>,
) {
  if (removedSearchTextHash.size == 0) return;
  collector.push(
    db
      .delete(expenseTextsTable)
      .where(
        and(
          inArray(expenseTextsTable.textHash, Array.from(removedSearchTextHash)),
          eq(expenseTextsTable.expenseId, expenseId),
        ),
      ),
  );
}

function queueNewSearchables(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  expenseId: string,
  inputSearchables: SearchableInfo[],
  inputSearchTextHashMapping: Map<string, number>,
  newSearchTextHash: Set<number>,
  missingHash: Set<number>,
  extgHashCtx: Map<number, Set<number>>,
) {
  const texts: (typeof textsTable.$inferInsert)[] = [];
  const textChunks: (typeof textChunksTable.$inferInsert)[] = [];
  const expenseTexts: (typeof expenseTextsTable.$inferInsert)[] = [];
  const textsContexts: (typeof textsContextsTable.$inferInsert)[] = [];

  for (const { text, sourceId, context } of inputSearchables) {
    const textHash = inputSearchTextHashMapping.get(text);
    if (!textHash) continue;
    const isExtg = newSearchTextHash.has(textHash);
    let isNewContext = false;
    if (context) {
      const ctxTextHash = inputSearchTextHashMapping.get(context);
      if (ctxTextHash) {
        isNewContext = !extgHashCtx.get(textHash)?.has(ctxTextHash);
        if (isNewContext) textsContexts.push({ textHash, ctxTextHash });
      }
    }

    if (isExtg && !isNewContext) continue;
    if (missingHash.has(textHash)) {
      texts.push({ textHash, userId, text });
      textChunks.push(...getTrigrams(text).map(chunk => ({ userId, chunk, textHash })));
    }
    if (!isExtg) expenseTexts.push({ textHash, sourceId, expenseId });
  }

  collector.pushAll(
    ...splitArray(texts, 30).map(values => db.insert(textsTable).values(values).onConflictDoNothing()),
    ...splitArray(textChunks, 30).map(values => db.insert(textChunksTable).values(values).onConflictDoNothing()),
    ...splitArray(textsContexts, 30).map(values => db.insert(textsContextsTable).values(values).onConflictDoNothing()),
    ...splitArray(expenseTexts, 30).map(values => db.insert(expenseTextsTable).values(values).onConflictDoNothing()),
  );
}
