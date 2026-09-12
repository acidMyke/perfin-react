import { caseWhen, excluded, max, type AppDatabase } from '#server/lib/db';
import type BatchCollector from '#server/lib/BatchCollector';
import { blacklistSearchableText } from '#server/lib/expenseHelper';
import { getTextHash, getTrigrams, splitArray } from '#server/lib/utils';
import { and, eq, desc, lt, inArray, count, SQL, isNotNull, min, gte } from 'drizzle-orm';
import {
  textsTable,
  textChunksTable,
  expenseTextsTable,
  searchIndexGenerationsTable,
  expenseAdjustmentsTable,
  expenseItemsTable,
  expensesTable,
  geoCellsTable,
  geoTextsTable,
} from '../../../db/schema';
import z from 'zod';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { ProtectedContext } from '#server/lib/trpc';
import {
  createGetTextId,
  generateSearchChunks,
  getGeoCellBounds,
  getGeoCellId,
  TEXT_KIND,
  type TextIdParamter,
} from '#server/lib/indexing';

type ExpenseInfoChildrenForIndexing = {
  id: string;
  name: null | undefined | string;
  isDeleted?: undefined | null | boolean;
};

export type ExpenseInfoForIndexing = {
  id: string;
  userId: string;
  latitude?: number | undefined | null;
  longitude?: number | undefined | null;
  billedAt: Date;
  shopName?: null | undefined | string;
  shopMall?: null | undefined | string;
  items?: ExpenseInfoChildrenForIndexing[];
  adjustments?: ExpenseInfoChildrenForIndexing[];
};

type Searchable = TextIdParamter & {
  expenseId: string;
  expenseBilledAt: Date;
  coordinate?: Pick<ExpenseInfoForIndexing, 'latitude' | 'longitude'>;
  sourceId: string;
  context?: Omit<TextIdParamter, 'userId'> | null | undefined | '';
};

function gatherExpenseSearchables(...expenses: ExpenseInfoForIndexing[]) {
  const searchables: Searchable[] = [];

  for (const expense of expenses) {
    if (expense.shopName) {
      searchables.push({
        userId: expense.userId,
        expenseId: expense.id,
        expenseBilledAt: expense.billedAt,
        text: expense.shopName,
        sourceId: expense.id,
        kind: TEXT_KIND.SHOP_NAME,
        context: expense.shopMall && {
          kind: TEXT_KIND.MALL_NAME,
          text: expense.shopMall,
        },
        coordinate: {
          latitude: expense.latitude,
          longitude: expense.longitude,
        },
      });
    }

    if (expense.shopMall) {
      searchables.push({
        userId: expense.userId,
        expenseId: expense.id,
        expenseBilledAt: expense.billedAt,
        text: expense.shopMall,
        sourceId: expense.id,
        kind: TEXT_KIND.MALL_NAME,
        coordinate: {
          latitude: expense.latitude,
          longitude: expense.longitude,
        },
      });
    }

    if (expense.items) {
      for (const item of expense.items) {
        if (item.isDeleted || !item.name) continue;
        searchables.push({
          userId: expense.userId,
          expenseId: expense.id,
          expenseBilledAt: expense.billedAt,
          text: item.name,
          sourceId: item.id,
          kind: TEXT_KIND.ITEM_NAME,
          context: expense.shopName && {
            kind: TEXT_KIND.SHOP_NAME,
            text: expense.shopName,
          },
        });
      }
    }

    if (expense.adjustments) {
      for (const adj of expense.adjustments) {
        if (adj.isDeleted || !adj.name) continue;
        searchables.push({
          userId: expense.userId,
          expenseId: expense.id,
          expenseBilledAt: expense.billedAt,
          text: adj.name,
          sourceId: adj.id,
          kind: TEXT_KIND.ADJ_NAME,
          context: expense.shopName && {
            kind: TEXT_KIND.SHOP_NAME,
            text: expense.shopName,
          },
        });
      }
    }
  }

  return searchables;
}

async function prepareSearchables(searchables: Searchable[], indexGen: number) {
  const getTextId = await createGetTextId(...searchables);

  const textsUpserts: (typeof textsTable.$inferInsert)[] = [];
  const textChunkUpserts: (typeof textChunksTable.$inferInsert)[] = [];
  const expenseTextsUpserts: (typeof expenseTextsTable.$inferInsert)[] = [];
  const geoCellsUpserts: (typeof geoCellsTable.$inferInsert)[] = [];
  const geoTextsUpserts: (typeof geoTextsTable.$inferInsert)[] = [];

  const processedTextIdArrayBuffer = new Set<ArrayBuffer>();
  const processedGeoCellId = new Set<number>();

  for (const searchable of searchables) {
    const { userId, expenseId, expenseBilledAt, sourceId, kind, text, context, coordinate } = searchable;
    if (blacklistSearchableText.has(text)) continue;

    const textIdArrayBuffer = getTextId(searchable);
    if (!textIdArrayBuffer) continue;
    const textId = Buffer.from(textIdArrayBuffer);

    let ctxTextId: Buffer<ArrayBuffer> | null = null;
    if (context) {
      const ctxTextIdArrayBuffer = getTextId({ ...context, userId });
      if (ctxTextIdArrayBuffer) {
        ctxTextId = Buffer.from(ctxTextIdArrayBuffer);
      }
    }

    if (!processedTextIdArrayBuffer.has(textIdArrayBuffer)) {
      processedTextIdArrayBuffer.add(textIdArrayBuffer);
      textsUpserts.push({ id: Buffer.from(textIdArrayBuffer), userId, kind, text, indexGen });
      textChunkUpserts.push(...generateSearchChunks(text).map(chunk => ({ textId, userId, kind, chunk, indexGen })));
    }

    if (coordinate?.latitude && coordinate.longitude) {
      const geoCellParam = { latitude: coordinate?.latitude, longitude: coordinate.longitude };
      const geoCellId = getGeoCellId(geoCellParam);
      if (!processedGeoCellId.has(geoCellId)) {
        const geoCellBounds = getGeoCellBounds(geoCellParam);
        geoCellsUpserts.push({ ...geoCellBounds, id: geoCellId, indexGen });
      }
      geoTextsUpserts.push({ geoCellId, textId, indexGen });
    }

    expenseTextsUpserts.push({ expenseId, expenseBilledAt, sourceId, textId, ctxTextId, indexGen });
  }

  return { textsUpserts, textChunkUpserts, expenseTextsUpserts, geoCellsUpserts, geoTextsUpserts };
}

function queueDeleteExpenseTextsByExpenseId(collector: BatchCollector, db: AppDatabase, expenseId: string) {
  collector.push(db.delete(expenseTextsTable).where(eq(expenseTextsTable.expenseId, expenseId)));
}

function queueSaveSearchables(
  collector: BatchCollector,
  db: AppDatabase,
  {
    textsUpserts,
    textChunkUpserts,
    expenseTextsUpserts,
    geoCellsUpserts,
    geoTextsUpserts,
  }: Awaited<ReturnType<typeof prepareSearchables>>,
) {
  collector.pushAll(
    ...splitArray(textsUpserts, 19).map(values =>
      db
        .insert(textsTable)
        .values(values)
        .onConflictDoUpdate({
          target: textsTable.id,
          set: { indexGen: excluded(textsTable.indexGen) },
        }),
    ),
    ...splitArray(textChunkUpserts, 19).map(values =>
      db
        .insert(textChunksTable)
        .values(values)
        .onConflictDoUpdate({
          target: [textChunksTable.textId, textChunksTable.chunk],
          set: { indexGen: excluded(textChunksTable.indexGen) },
        }),
    ),
    ...splitArray(expenseTextsUpserts, 16).map(values =>
      db
        .insert(expenseTextsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [expenseTextsTable.textId, expenseTextsTable.sourceId],
          set: { indexGen: excluded(expenseTextsTable.indexGen), ctxTextId: excluded(expenseTextsTable.ctxTextId) },
        }),
    ),
    ...splitArray(geoCellsUpserts, 16).map(values =>
      db
        .insert(geoCellsTable)
        .values(values)
        .onConflictDoUpdate({
          target: geoCellsTable.id,
          set: { indexGen: excluded(geoCellsTable.indexGen) },
        }),
    ),
    ...splitArray(geoTextsUpserts, 33).map(values =>
      db
        .insert(geoTextsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [geoTextsTable.geoCellId, geoTextsTable.textId],
          set: { indexGen: excluded(geoTextsTable.indexGen) },
        }),
    ),
  );
}

async function getLatestUserIndexVersion(db: AppDatabase, userId: string) {
  const [{ version = 0 } = {}] = await db
    .select({ version: searchIndexGenerationsTable.currentGen })
    .from(searchIndexGenerationsTable)
    .where(eq(searchIndexGenerationsTable.userId, userId))
    .orderBy(desc(searchIndexGenerationsTable.currentGen))
    .limit(1);

  return version;
}

export async function processSaveExpenseSearchIndexing(
  collector: BatchCollector,
  db: AppDatabase,
  expense: ExpenseInfoForIndexing,
) {
  const searchables = gatherExpenseSearchables(expense);
  if (searchables.length <= 0) return;
  const version = await getLatestUserIndexVersion(db, expense.userId);
  const records = await prepareSearchables(searchables, version);
  queueDeleteExpenseTextsByExpenseId(collector, db, expense.id);
  queueSaveSearchables(collector, db, records);
}

export async function processReindexing(
  collector: BatchCollector,
  db: AppDatabase,
  expenses: ExpenseInfoForIndexing[],
  currentVersion: number,
) {
  const searchables = gatherExpenseSearchables(...expenses);
  if (searchables.length <= 0) return;
  const records = await prepareSearchables(searchables, currentVersion);
  queueSaveSearchables(collector, db, records);
}

export async function cleanupOldIndex(db: AppDatabase, userId: string, currentVersion: number) {
  const textsTableCond = and(eq(textsTable.userId, userId), lt(textsTable.indexGen, currentVersion));
  const textsTableSq = db.select({ hash: textsTable.id }).from(textsTable).where(textsTableCond);

  const [[{ deletedExpenseTextsCount }], { meta: deleteMeta }] = await db.batch([
    db
      .select({ deletedExpenseTextsCount: count() })
      .from(expenseTextsTable)
      .where(inArray(expenseTextsTable.textId, textsTableSq)),
    db.delete(textsTable).where(textsTableCond),
  ]);

  await db
    .update(searchIndexGenerationsTable)
    .set({ deletedExpenseTextsCount, totalDeletedCount: deleteMeta.changes, completedAt: new Date() })
    .where(
      and(eq(searchIndexGenerationsTable.userId, userId), eq(searchIndexGenerationsTable.currentGen, currentVersion)),
    );
}

export const getSuggestionInputSchema = z.object({
  scope: z.enum(['shopName', 'shopMall', 'itemName', 'adjName']),
  search: z.string(),
  context: z.string().optional(),
});

type GetSuggestionInput = z.infer<typeof getSuggestionInputSchema>;

export async function getSuggestions(ctx: ProtectedContext, input: GetSuggestionInput) {
  const { db, userId } = ctx;
  const search = input.search.trim();
  const context = input.context?.trim();

  if (!search && !context) {
    return { suggestions: [] as string[] };
  }

  let textColumn: AnySQLiteColumn<{ data: string }>;
  let sourceTable: typeof expensesTable | typeof expenseItemsTable | typeof expenseAdjustmentsTable;

  switch (input.scope) {
    case 'shopName':
      textColumn = expensesTable.shopName;
      sourceTable = expensesTable;
      break;
    case 'shopMall':
      textColumn = expensesTable.shopMall;
      sourceTable = expensesTable;
      break;
    case 'itemName':
      textColumn = expenseItemsTable.name;
      sourceTable = expenseItemsTable;
      break;
    case 'adjName':
      textColumn = expenseAdjustmentsTable.name;
      sourceTable = expenseAdjustmentsTable;
      break;
  }
  const contextHash = context ? await getTextHash(userId, context) : undefined;

  if (!search) {
    // Suggestion via context
    const results = await db
      .select({ text: min(textColumn) })
      .from(expenseTextsTable)
      .innerJoin(sourceTable, eq(expenseTextsTable.sourceId, sourceTable.id))
      .where(and(eq(expenseTextsTable.ctxTextId, contextHash!), isNotNull(textColumn)))
      .groupBy(expenseTextsTable.textId)
      .limit(10);

    return { suggestions: results.map(({ text }) => text!) };
  }
  // Search by input

  const trigrams = getTrigrams(search);
  if (trigrams.length === 0) return { suggestions: [] };

  const baseMatchedChunks = db
    .select({
      textHash: textChunksTable.textId.as('text_hash'),
      matchCount: count(textChunksTable.chunk).as('match_count'),
    })
    .from(textChunksTable)
    .where(and(eq(textChunksTable.userId, userId), inArray(textChunksTable.chunk, trigrams)))
    .groupBy(textChunksTable.textId);

  // filter out lower quality matches
  const matchedChunks = (
    trigrams.length > 5
      ? baseMatchedChunks.having(gte(count(textChunksTable.chunk), trigrams.length - 5))
      : baseMatchedChunks
  ).as('matchedChunks');

  const orderLogic: SQL[] = [];
  if (contextHash) {
    // sort by context exists
    orderLogic.push(desc(max(caseWhen(eq(expenseTextsTable.ctxTextId, contextHash), 1).else(0))));
  }
  orderLogic.push(desc(max(matchedChunks.matchCount)));

  const results = await db
    .select({ text: min(textColumn) })
    .from(matchedChunks)
    .innerJoin(expenseTextsTable, eq(matchedChunks.textHash, expenseTextsTable.textId))
    .innerJoin(sourceTable, eq(expenseTextsTable.sourceId, sourceTable.id))
    .where(isNotNull(textColumn))
    .groupBy(matchedChunks.textHash)
    .orderBy(...orderLogic)
    .limit(10);

  return { suggestions: results.map(({ text }) => text!) };
}
