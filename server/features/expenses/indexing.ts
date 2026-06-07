import { excluded, type AppDatabase, type BatchCollector } from '#server/lib/db';
import { blacklistSearchableText } from '#server/lib/expenseHelper';
import { getMultiUserTextsHashes, getTrigrams, splitArray } from '#server/lib/utils';
import { and, eq, desc, lt, inArray, count } from 'drizzle-orm';
import { textsTable, textChunksTable, expenseTextsTable, searchIndexVersionTable } from '../../../db/schema';

type ExpenseInfoChildrenForIndexing = {
  id: string;
  name: null | undefined | string;
  isDeleted?: undefined | null | boolean;
};

export type ExpenseInfoForIndexing = {
  id: string;
  userId: string;
  shopName?: null | undefined | string;
  shopMall?: null | undefined | string;
  items?: ExpenseInfoChildrenForIndexing[];
  adjustments?: ExpenseInfoChildrenForIndexing[];
};

type Searchable = {
  userId: string;
  expenseId: string;
  context?: string | null;
  text: string;
  sourceId: string;
};

function gatherExpenseSearchables(...expenses: ExpenseInfoForIndexing[]) {
  const searchables: Searchable[] = [];

  for (const expense of expenses) {
    if (expense.shopName) {
      searchables.push({
        userId: expense.userId,
        expenseId: expense.id,
        context: expense.shopMall,
        text: expense.shopName,
        sourceId: expense.id,
      });
    }

    if (expense.shopMall) {
      searchables.push({
        userId: expense.userId,
        expenseId: expense.id,
        text: expense.shopMall,
        sourceId: expense.id,
      });
    }

    if (expense.items) {
      for (const item of expense.items) {
        if (item.isDeleted || !item.name) continue;
        searchables.push({
          userId: expense.userId,
          expenseId: expense.id,
          context: expense.shopName,
          text: item.name,
          sourceId: item.id,
        });
      }
    }

    if (expense.adjustments) {
      for (const adj of expense.adjustments) {
        if (adj.isDeleted || !adj.name) continue;
        searchables.push({
          userId: expense.userId,
          expenseId: expense.id,
          context: expense.shopName,
          text: adj.name,
          sourceId: adj.id,
        });
      }
    }
  }

  return searchables;
}

async function prepareSearchables(searchables: Searchable[], version: number) {
  const searchableHashes = await getMultiUserTextsHashes(searchables);

  const textsUpserts: (typeof textsTable.$inferInsert)[] = [];
  const textChunkUpserts: (typeof textChunksTable.$inferInsert)[] = [];
  const expenseTextsUpserts: (typeof expenseTextsTable.$inferInsert)[] = [];

  const processedTextHashes = new Set<number>();

  for (const { userId, expenseId, text, sourceId, context } of searchables) {
    if (blacklistSearchableText.has(text)) continue;

    const textHash = searchableHashes.getHash(userId, text)!;
    let ctxTextHash: number | null = null;
    if (context) ctxTextHash = searchableHashes.getHash(userId, context) ?? null;

    if (!processedTextHashes.has(textHash)) {
      processedTextHashes.add(textHash);
      textsUpserts.push({ textHash, userId, text, version });
      textChunkUpserts.push(...getTrigrams(text).map(chunk => ({ userId, chunk, textHash, version })));
    }

    expenseTextsUpserts.push({ textHash, sourceId, expenseId, ctxTextHash, version });
  }

  return { textsUpserts, textChunkUpserts, expenseTextsUpserts };
}

function queueDeleteExpenseTextsByExpenseId(collector: BatchCollector, db: AppDatabase, expenseId: string) {
  collector.push(db.delete(expenseTextsTable).where(eq(expenseTextsTable.expenseId, expenseId)));
}

function queueSaveSearchables(
  collector: BatchCollector,
  db: AppDatabase,
  { textsUpserts, textChunkUpserts, expenseTextsUpserts }: Awaited<ReturnType<typeof prepareSearchables>>,
) {
  collector.pushAll(
    ...splitArray(textsUpserts, 24).map(values =>
      db
        .insert(textsTable)
        .values(values)
        .onConflictDoUpdate({
          target: textsTable.textHash,
          set: { version: excluded(textsTable.version) },
        }),
    ),
    ...splitArray(textChunkUpserts, 24).map(values =>
      db
        .insert(textChunksTable)
        .values(values)
        .onConflictDoUpdate({
          target: [textChunksTable.textHash, textChunksTable.chunk],
          set: { version: excluded(textChunksTable.version) },
        }),
    ),
    ...splitArray(expenseTextsUpserts, 19).map(values =>
      db
        .insert(expenseTextsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [expenseTextsTable.textHash, expenseTextsTable.sourceId],
          set: { version: excluded(expenseTextsTable.version), ctxTextHash: excluded(expenseTextsTable.ctxTextHash) },
        }),
    ),
  );
}

async function getLatestUserIndexVersion(db: AppDatabase, userId: string) {
  const [{ version = 0 } = {}] = await db
    .select({ version: searchIndexVersionTable.version })
    .from(searchIndexVersionTable)
    .where(eq(searchIndexVersionTable.userId, userId))
    .orderBy(desc(searchIndexVersionTable.version))
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
  const textsTableCond = and(eq(textsTable.userId, userId), lt(textsTable.version, currentVersion));
  const textsTableSq = db.select({ hash: textsTable.textHash }).from(textsTable).where(textsTableCond);

  const [[{ deletedExpenseTextsCount }], { meta: deleteMeta }] = await db.batch([
    db
      .select({ deletedExpenseTextsCount: count() })
      .from(expenseTextsTable)
      .where(inArray(expenseTextsTable.textHash, textsTableSq)),
    db.delete(textsTable).where(textsTableCond),
  ]);

  await db
    .update(searchIndexVersionTable)
    .set({ deletedExpenseTextsCount, totalDeletedCount: deleteMeta.changes, completedAt: new Date() })
    .where(and(eq(searchIndexVersionTable.userId, userId), eq(searchIndexVersionTable.version, currentVersion)));
}
