import { caseWhen, excluded, excludedAll, max, sumAsNumber, type AppDatabase } from '#server/lib/db';
import type BatchCollector from '#server/lib/BatchCollector';
import { blacklistSearchableText } from '#server/lib/expenseHelper';
import { splitArray } from '#server/lib/utils';
import { and, eq, desc, lt, inArray, count, sql, countDistinct, gte } from 'drizzle-orm';
import {
  textsTable,
  textChunksTable,
  expenseTextsTable,
  searchIndexGenerationsTable,
  geoCellsTable,
  geoTextsTable,
  ctxTextsTable,
} from '../../../db/schema';
import z from 'zod';
import type { ProtectedContext } from '#server/lib/trpc';
import {
  createGetTextId,
  generateSearchChunks,
  getGeoCellBounds,
  getGeoCell,
  getSingleTextId,
  TEXT_KIND,
  type TextIdParamter,
} from '#server/lib/indexing';
import { subDays } from 'date-fns';

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
  billedAt: Date;
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
        billedAt: expense.billedAt,
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
        billedAt: expense.billedAt,
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
          billedAt: expense.billedAt,
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
          billedAt: expense.billedAt,
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
  const ctxTextsUpserts: (typeof ctxTextsTable.$inferInsert)[] = [];
  const geoTextsUpserts: (typeof geoTextsTable.$inferInsert)[] = [];

  const processedTextIdArrayBuffer = new Set<ArrayBuffer>();
  const processedGeoCellId = new Set<number>();

  for (const searchable of searchables) {
    const { userId, expenseId, sourceId, kind, text, context, coordinate, billedAt } = searchable;
    if (blacklistSearchableText.has(text)) continue;

    const textIdArrayBuffer = getTextId(searchable);
    if (!textIdArrayBuffer) continue;
    const textId = Buffer.from(textIdArrayBuffer);

    if (!processedTextIdArrayBuffer.has(textIdArrayBuffer)) {
      processedTextIdArrayBuffer.add(textIdArrayBuffer);
      textsUpserts.push({ id: textId, userId, kind, text, indexGen, lastUsedAt: billedAt, usageCount: 1 });
      textChunkUpserts.push(...generateSearchChunks(text).map(chunk => ({ textId, userId, kind, chunk, indexGen })));
    }

    if (context) {
      const ctxTextIdArrayBuffer = getTextId({ ...context, userId });
      if (ctxTextIdArrayBuffer) {
        const ctxTextId = Buffer.from(ctxTextIdArrayBuffer);
        ctxTextsUpserts.push({ ctxTextId, textId, indexGen });
      }
    }

    if (coordinate?.latitude && coordinate.longitude) {
      const geoCellParam = { latitude: coordinate?.latitude, longitude: coordinate.longitude };
      const { id: geoCellId } = getGeoCell(geoCellParam);
      if (!processedGeoCellId.has(geoCellId)) {
        const geoCellBounds = getGeoCellBounds(geoCellParam);
        geoCellsUpserts.push({ ...geoCellBounds, id: geoCellId, indexGen });
      }
      geoTextsUpserts.push({ textId, userId, kind, geoCellId, indexGen });
    }

    expenseTextsUpserts.push({ expenseId, expenseBilledAt: billedAt, sourceId, textId, indexGen });
  }

  return { textsUpserts, textChunkUpserts, expenseTextsUpserts, geoCellsUpserts, ctxTextsUpserts, geoTextsUpserts };
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
    ctxTextsUpserts,
    geoTextsUpserts,
  }: Awaited<ReturnType<typeof prepareSearchables>>,
) {
  collector.pushAll(
    ...splitArray(textsUpserts, 14).map(values =>
      db
        .insert(textsTable)
        .values(values)
        .onConflictDoUpdate({
          target: textsTable.id,
          set: {
            indexGen: excluded(textsTable.indexGen),
            lastUsedAt: sql`max(${textsTable.lastUsedAt}, ${excluded(textsTable.lastUsedAt)})`,
            usageCount: sql`${textsTable.usageCount} + 1`,
          },
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
    ...splitArray(expenseTextsUpserts, 19).map(values =>
      db
        .insert(expenseTextsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [expenseTextsTable.textId, expenseTextsTable.sourceId],
          set: excludedAll(expenseTextsTable, ['textId', 'sourceId']),
        }),
    ),
    ...splitArray(geoCellsUpserts, 24).map(values =>
      db
        .insert(geoCellsTable)
        .values(values)
        .onConflictDoUpdate({
          target: geoCellsTable.id,
          set: { indexGen: excluded(geoCellsTable.indexGen) },
        }),
    ),
    ...splitArray(ctxTextsUpserts, 33).map(values =>
      db
        .insert(ctxTextsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [ctxTextsTable.ctxTextId, ctxTextsTable.textId],
          set: { indexGen: excluded(ctxTextsTable.indexGen) },
        }),
    ),
    ...splitArray(geoTextsUpserts, 14).map(values =>
      db
        .insert(geoTextsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [geoTextsTable.userId, geoTextsTable.kind, geoTextsTable.geoCellId, geoTextsTable.textId],
          set: {
            indexGen: excluded(geoTextsTable.indexGen),
            latitude: caseWhen(
              gt(excluded(geoTextsTable.indexGen), geoTextsTable.indexGen),
              excluded(geoTextsTable.latitude),
            ).else(sql`((${geoTextsTable.latitude} * 2 + ${excluded(geoTextsTable.latitude)}) / 3)`),
            longitude: caseWhen(
              gt(excluded(geoTextsTable.indexGen), geoTextsTable.indexGen),
              excluded(geoTextsTable.longitude),
            ).else(sql`((${geoTextsTable.longitude} * 2 + ${excluded(geoTextsTable.longitude)}) / 3)`),
          },
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

export async function processReindexingFinalStage(db: AppDatabase, userId: string) {
  const usersTextSq = db.select({ textId: textsTable.id }).from(textsTable).where(eq(textsTable.userId, userId));

  const aggExpenseTxtTableSq = db
    .select({
      textId: expenseTextsTable.textId.as('text_id'),
      lastUsedAt: max(expenseTextsTable.expenseBilledAt).as('last_used_at'),
      usageCount: count(expenseTextsTable.sourceId).as('usage_count'),
    })
    .from(expenseTextsTable)
    .where(inArray(expenseTextsTable.textId, usersTextSq))
    .groupBy(expenseTextsTable.textId)
    .as('agg_expense_txt_sq');

  return db
    .update(textsTable)
    .set({
      lastUsedAt: sql`agg_expense_txt_sq.last_used_at`,
      usageCount: sql`agg_expense_txt_sq.usage_count`,
    })
    .from(aggExpenseTxtTableSq)
    .where(and(eq(textsTable.userId, userId), eq(textsTable.id, aggExpenseTxtTableSq.textId)));
}

export const getSuggestionInputSchema = z.object({
  kind: z.enum([TEXT_KIND.SHOP_NAME, TEXT_KIND.MALL_NAME, TEXT_KIND.ITEM_NAME, TEXT_KIND.ADJ_NAME]),
  search: z.string().optional(),
  context: z.object({ kind: z.enum([TEXT_KIND.SHOP_NAME, TEXT_KIND.MALL_NAME]), text: z.string() }).optional(),
  coordinate: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
});

type GetSuggestionInput = z.infer<typeof getSuggestionInputSchema>;

export async function getSuggestions(ctx: ProtectedContext, input: GetSuggestionInput) {
  const { db, userId } = ctx;
  const { kind, context, coordinate } = input;
  const search = input.search?.trim();
  const contextText = context?.text?.trim();

  if (!search && !contextText && !coordinate) {
    return { suggestions: [] };
  }

  const textIdCol = 'text_id' as const;
  const chunkCountScoreCol = 'chunk_score' as const;
  const frequencyScoreCol = 'frequency_score' as const;
  const recencyScoreCol = 'recency_score' as const;
  const contextScoreCol = 'context_score' as const;
  const spatialScoreCol = 'spatial_score' as const;

  let searchQuery = db
    .select({
      textId: sql<null | Buffer<ArrayBufferLike>>`NULL`.as(textIdCol),
      chunkCountScore: sql<number>`0`.as(chunkCountScoreCol),
      contextScore: sql<number>`0`.as(contextScoreCol),
      spatialScore: sql<number>`0`.as(spatialScoreCol),
    })
    .from(textChunksTable)
    .where(sql`false`)
    .$dynamic();

  if (search) {
    const searchChunks = generateSearchChunks(search);
    searchQuery = searchQuery.unionAll(
      db
        .select({
          textId: textChunksTable.textId.as(textIdCol),
          chunkCountScore: countDistinct(textChunksTable.chunk).as(chunkCountScoreCol),
          contextScore: sql<number>`0`.as(contextScoreCol),
          spatialScore: sql<number>`0`.as(spatialScoreCol),
        })
        .from(textChunksTable)
        .where(
          and(
            eq(textChunksTable.userId, userId),
            eq(textChunksTable.kind, kind),
            inArray(textChunksTable.chunk, searchChunks),
          ),
        )
        .groupBy(textChunksTable.textId),
    );
  }

  if (context) {
    const ctxTextId = await getSingleTextId({ userId, ...context });
    searchQuery = searchQuery.unionAll(
      db
        .select({
          textId: ctxTextsTable.textId.as(textIdCol),
          chunkCountScore: sql<number>`0`.as(chunkCountScoreCol),
          contextScore: sql<number>`2`.as(contextScoreCol),
          spatialScore: sql<number>`0`.as(spatialScoreCol),
        })
        .from(ctxTextsTable)
        .where(eq(ctxTextsTable.ctxTextId, Buffer.from(ctxTextId))),
    );
  }

  if (coordinate) {
    const geoCell = getGeoCell(coordinate);
    searchQuery = searchQuery.unionAll(
      db
        .selectDistinct({
          textId: geoTextsTable.textId.as(textIdCol),
          chunkCountScore: sql<0>`0`.as(chunkCountScoreCol),
          contextScore: sql<0>`0`.as(contextScoreCol),
          spatialScore: sql<2>`2`.as(spatialScoreCol),
        })
        .from(geoTextsTable)
        .where(
          and(eq(geoTextsTable.userId, userId), eq(geoTextsTable.kind, kind), eq(geoTextsTable.geoCellId, geoCell.id)),
        ),
    );
  }

  const searchSubquery = searchQuery.as('search_sq');

  const aggregatedSubquery = db
    .select({
      textId: searchSubquery.textId,
      chunkCountScore: sumAsNumber(searchSubquery.chunkCountScore).as(chunkCountScoreCol),
      contextScore: sumAsNumber(searchSubquery.contextScore).as(contextScoreCol),
      spatialScore: sumAsNumber(searchSubquery.spatialScore).as(spatialScoreCol),
    })
    .from(searchSubquery)
    .groupBy(sql.raw(textIdCol))
    .as('input_scoring_sq');

  const result = await db
    .select({
      text: textsTable.text,
      chunkCountScore: aggregatedSubquery.chunkCountScore,
      contextScore: aggregatedSubquery.contextScore,
      spatialScore: aggregatedSubquery.spatialScore,
      frequencyScore: caseWhen(gte(textsTable.usageCount, 20), 2)
        .whenThen(gte(textsTable.usageCount, 5), 1)
        .else(0)
        .as(frequencyScoreCol),
      recencyScore: caseWhen(gte(textsTable.lastUsedAt, subDays(Date.now(), 4)), -1)
        .whenThen(gte(textsTable.lastUsedAt, subDays(Date.now(), 28)), 2)
        .whenThen(gte(textsTable.lastUsedAt, subDays(Date.now(), 63)), 1)
        .else(0)
        .as(recencyScoreCol),
    })
    .from(aggregatedSubquery)
    .innerJoin(
      textsTable,
      and(eq(aggregatedSubquery.textId, textsTable.id), eq(textsTable.userId, userId), eq(textsTable.kind, kind)),
    )
    .orderBy(
      desc(
        sql.raw(
          `${chunkCountScoreCol} + ${frequencyScoreCol} + ${recencyScoreCol} + ${contextScoreCol} + ${spatialScoreCol}`,
        ),
      ),
    );

  console.log('Suggestion:', { input, result });
  return { suggestions: result };
}
