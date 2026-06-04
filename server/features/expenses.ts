import { protectedProcedure } from '../lib/trpc';
import {
  accountsTable,
  categoriesTable,
  expenseAdjustmentsTable,
  expenseItemsTable,
  expensesTable,
  expenseTextsTable,
  textChunksTable,
} from '../../db/schema';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, min, sql, SQL, sum } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { endOfMonth } from 'date-fns';
import { GST_NAME, SERVICE_CHARGE_NAME } from '../lib/expenseHelper';
import { caseWhen, coalesce, concat, jsonGroupArray, jsonGroupObjectArray, max } from '../lib/db';
import { getLocationBoxId, getTextHash, getTextsHashes, getTrigrams } from '../lib/utils';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { processSaveExpense, saveExpenseInputSchema } from './expenses/saveExpense';

const loadExpenseOptionsProcedure = protectedProcedure.query(async ({ ctx: { db, user } }) => {
  const [accountOptions, categoryOptions] = await db.batch([
    db
      .select({ value: accountsTable.id, label: accountsTable.name })
      .from(accountsTable)
      .where(and(eq(accountsTable.userId, user.id), eq(accountsTable.isDeleted, false)))
      .orderBy(asc(accountsTable.sequence), asc(accountsTable.createdAt)),
    db
      .select({ value: categoriesTable.id, label: categoriesTable.name })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.userId, user.id), eq(categoriesTable.isDeleted, false)))
      .orderBy(asc(categoriesTable.sequence), asc(categoriesTable.createdAt)),
  ]);

  return {
    accountOptions,
    categoryOptions,
  };
});

const loadExpenseDetailProcedure = protectedProcedure
  .input(z.object({ expenseId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;

    const [[expense], items, adjustments] = await db.batch([
      db
        .select({
          amountCents: expensesTable.amountCents,
          billedAt: expensesTable.billedAt,
          accountId: expensesTable.accountId,
          categoryId: expensesTable.categoryId,
          type: expensesTable.type,
          latitude: expensesTable.latitude,
          longitude: expensesTable.longitude,
          geoAccuracy: expensesTable.geoAccuracy,
          shopName: expensesTable.shopName,
          shopMall: expensesTable.shopMall,
          version: expensesTable.version,
          isDeleted: expensesTable.isDeleted,
          specifiedAmountCents: expensesTable.specifiedAmountCents,
        })
        .from(expensesTable)
        .where(and(eq(expensesTable.userId, userId), eq(expensesTable.id, input.expenseId)))
        .limit(1),
      db
        .select({
          id: expenseItemsTable.id,
          name: expenseItemsTable.name,
          quantity: expenseItemsTable.quantity,
          priceCents: expenseItemsTable.priceCents,
          isDeleted: expenseItemsTable.isDeleted,
        })
        .from(expenseItemsTable)
        .where(and(eq(expenseItemsTable.expenseId, input.expenseId), eq(expenseItemsTable.isDeleted, false))),
      db
        .select({
          id: expenseAdjustmentsTable.id,
          name: expenseAdjustmentsTable.name,
          amountCents: expenseAdjustmentsTable.amountCents,
          rateBps: expenseAdjustmentsTable.rateBps,
          expenseItemId: expenseAdjustmentsTable.expenseItemId,
          isDeleted: expenseAdjustmentsTable.isDeleted,
        })
        .from(expenseAdjustmentsTable)
        .where(
          and(eq(expenseAdjustmentsTable.expenseId, input.expenseId), eq(expenseAdjustmentsTable.isDeleted, false)),
        ),
    ]);

    if (!expense) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return { ...expense, items, adjustments };
  });

const saveExpenseProcedure = protectedProcedure
  .input(saveExpenseInputSchema)
  .mutation(({ input, ctx }) => processSaveExpense(ctx, input));

const listExpenseProcedure = protectedProcedure
  .input(z.object({ month: z.number().min(0).max(11), year: z.number().min(2020) }))
  .query(async ({ input, ctx }) => {
    const { db } = ctx;
    const userId = ctx.user.id;
    const { year, month } = input;
    const filterStart = new Date(year, month, 1, 0, 0, 0);
    const filterEnd = endOfMonth(filterStart);

    const filterList: (SQL | undefined)[] = [
      eq(expensesTable.userId, userId),
      gte(expensesTable.billedAt, filterStart),
      lt(expensesTable.billedAt, filterEnd),
    ];

    const itemCount = count(expenseItemsTable.id);
    const itemOne = max(caseWhen<string>(eq(expenseItemsTable.sequence, sql.raw('0')), expenseItemsTable.name));
    const itemTwo = max(caseWhen<string>(eq(expenseItemsTable.sequence, sql.raw('1')), expenseItemsTable.name));

    const expenses = await db
      .select({
        id: expensesTable.id,
        itemCount,
        description: caseWhen(eq(itemCount, sql.raw('1')), itemOne)
          .whenThen(eq(itemCount, sql.raw('2')), concat(itemOne, sql.raw("' and '"), itemTwo))
          .else(concat(itemOne, sql.raw("' and '"), sql`(${itemCount} - 1)`, sql.raw("' items'"))),
        shopDetail: concat(expensesTable.shopName, coalesce(concat(sql.raw("' @ '"), expensesTable.shopMall))),
        amount: sql<number>`ROUND(${expensesTable.amountCents} / CAST(100 AS REAL), 2)`,
        billedAt: expensesTable.billedAt,
        account: {
          id: accountsTable.id,
          name: accountsTable.name,
          isDeleted: accountsTable.isDeleted,
        },
        category: {
          id: categoriesTable.id,
          name: categoriesTable.name,
          isDeleted: categoriesTable.isDeleted,
        },
        createdAt: expensesTable.createdAt,
        isDeleted: expensesTable.isDeleted,
      })
      .from(expensesTable)
      .leftJoin(accountsTable, eq(expensesTable.accountId, accountsTable.id))
      .leftJoin(categoriesTable, eq(expensesTable.categoryId, categoriesTable.id))
      .leftJoin(
        expenseItemsTable,
        and(eq(expensesTable.id, expenseItemsTable.expenseId), eq(expenseItemsTable.isDeleted, false)),
      )
      .where(and(...filterList))
      .groupBy(expensesTable.id)
      .orderBy(desc(expensesTable.billedAt));

    return { expenses };
  });

const getSuggestionsProcedure = protectedProcedure
  .input(
    z.object({
      scope: z.enum(['shopName', 'shopMall', 'itemName', 'adjName']),
      search: z.string(),
      context: z.string().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const search = input.search.trim();
    const context = input.context?.trim();

    if (!search && !context) {
      return { suggestions: [] as string[] };
    }

    const where: SQL[] = [];
    let having: SQL | undefined;

    const orderBy: SQL[] = [desc(count(expenseTextsTable.sourceId))]; // By frequency
    const hashQuery = db
      .select({
        textHash: expenseTextsTable.textHash.as('text_hash'),
        sourceId: min(expenseTextsTable.sourceId).as('source_id'),
      })
      .from(expenseTextsTable);

    let joinedHashQuery: ReturnType<typeof hashQuery.innerJoin> | undefined;

    if (search) {
      // search by chunks
      const trigrams = getTrigrams(search);
      joinedHashQuery = hashQuery.innerJoin(textChunksTable, eq(expenseTextsTable.textHash, textChunksTable.textHash));
      where.push(eq(textChunksTable.userId, userId), inArray(textChunksTable.chunk, trigrams));

      if (trigrams.length > 5) {
        // If there is more than 5 chunks for searching, remove those with less matches
        having = gte(count(textChunksTable.chunk), trigrams.length - 5);
      }

      if (!context) {
        orderBy.unshift(desc(count(textChunksTable.chunk)));
      }
    }

    if (context) {
      const contextHash = await getTextHash(userId, context);
      if (search) {
        // contextual sort, since it will be filtered by chunks
        const hasMatchingContext = caseWhen(eq(expenseTextsTable.ctxTextHash, contextHash), sql`5`).else(sql`0`);
        const relevance = sql`${max(hasMatchingContext)} + ${count(textChunksTable.chunk)}`;
        orderBy.unshift(desc(relevance));
      } else {
        // contextual search, filtering by context
        where.push(eq(expenseTextsTable.ctxTextHash, contextHash));
      }
    }

    if (!joinedHashQuery) {
      return { suggestions: [] };
    }

    const groupedHashQuery = hashQuery.where(and(...where)).groupBy(expenseTextsTable.textHash);
    const topHashesSubquery = (having ? groupedHashQuery.having(having) : groupedHashQuery)
      .orderBy(...orderBy)
      .limit(15)
      .as('top_hashes');

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

    const result = await db
      .select({ text: textColumn })
      .from(topHashesSubquery)
      .innerJoin(sourceTable, eq(topHashesSubquery.sourceId, sourceTable.id))
      .where(isNotNull(textColumn));

    return { suggestions: result.map(({ text }) => text!) };
  });

const suggestShopByLocationProcedure = protectedProcedure
  .input(z.object({ latitude: z.number(), longitude: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;
    const queryBoxIds = getLocationBoxId(input);
    const data = await db
      .select({
        shopName: sql<string>`${expensesTable.shopName}`,
        shopMalls: jsonGroupArray(expensesTable.shopMall, { distinct: true }),
      })
      .from(expensesTable)
      .where(
        and(
          isNotNull(expensesTable.shopName),
          eq(expensesTable.userId, userId),
          inArray(expensesTable.boxId, queryBoxIds),
        ),
      )
      .groupBy(expensesTable.shopName);

    return data;
  });

const getShopDetailProcedure = protectedProcedure
  .input(z.object({ shopName: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;
    const shopNameHash = await getTextHash(userId, input.shopName);
    const expenseIdCte = db.$with('expense_id_cte').as(
      db
        .selectDistinct({ expenseId: expenseTextsTable.expenseId.as('expense_id') })
        .from(expenseTextsTable)
        .where(eq(expenseTextsTable.textHash, shopNameHash)),
    );

    const data = await db
      .with(expenseIdCte)
      .selectDistinct({
        accountId: expensesTable.accountId,
        categoryId: expensesTable.categoryId,
        isGstExcluded: max(caseWhen(eq(expenseAdjustmentsTable.name, GST_NAME), sql<number>`1`).else(sql<number>`0`)),
        serviceChargeBps: max(
          caseWhen<number>(eq(expenseAdjustmentsTable.name, SERVICE_CHARGE_NAME), expenseAdjustmentsTable.rateBps),
        ),
      })
      .from(expenseIdCte)
      .innerJoin(expensesTable, eq(expenseIdCte.expenseId, expensesTable.id))
      .leftJoin(expenseAdjustmentsTable, eq(expenseIdCte.expenseId, expenseAdjustmentsTable.expenseId))
      .groupBy(expenseAdjustmentsTable.expenseId);

    return data;
  });

const inferItemPricesProcedure = protectedProcedure
  .input(z.object({ itemName: z.string(), shopName: z.string().nullish() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const texts = [input.itemName];
    if (input.shopName) {
      texts.push(input.shopName);
    }

    const hashes = await getTextsHashes(userId, texts);
    const where: SQL[] = [eq(expenseTextsTable.textHash, hashes.get(input.itemName)!)];
    if (input.shopName) {
      where.push(eq(expenseTextsTable.ctxTextHash, hashes.get(input.shopName)!));
    } else {
      where.push(isNull(expenseTextsTable.ctxTextHash));
    }
    return db
      .select({ priceCents: expenseItemsTable.priceCents, billedAt: max(expensesTable.billedAt), count: count() })
      .from(expenseTextsTable)
      .innerJoin(expenseItemsTable, eq(expenseTextsTable.sourceId, expenseItemsTable.id))
      .innerJoin(expensesTable, eq(expenseItemsTable.expenseId, expensesTable.id))
      .where(and(...where))
      .groupBy(expenseItemsTable.priceCents)
      .orderBy(desc(max(expensesTable.billedAt)), desc(count()))
      .limit(1);
  });

const setIsDeletedExpenseProcedure = protectedProcedure
  .input(z.object({ expenseId: z.string(), isDeleted: z.boolean(), version: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;
    const { expenseId, isDeleted, version } = input;

    // Validation
    const existing = await db.query.expensesTable.findFirst({
      where: { id: expenseId, userId },
      columns: { version: true },
    });

    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    if (existing.version > version) {
      throw new TRPCError({ code: 'CONFLICT' });
    }

    await db
      .update(expensesTable)
      .set({ isDeleted })
      .where(and(eq(expensesTable.id, expenseId), eq(expensesTable.userId, userId)));

    return { success: true };
  });

const searchExpenseProcedure = protectedProcedure
  .input(z.object({ search: z.string(), cursor: z.string().nullish() }))
  .query(async ({ ctx, input }) => {
    const { db, userId } = ctx;
    const search = input.search.trim();
    if (search.length < 3) return {};

    const trigrams = getTrigrams(search, { excludeUnigrams: true });

    const chunkCte = db.$with('chunk_cte').as(
      db
        .select({
          textHash: textChunksTable.textHash.as('text_hash'),
          chunkCount: count(textChunksTable.chunk).as('chunk_count'),
        })
        .from(textChunksTable)
        .groupBy(textChunksTable.textHash)
        .where(and(eq(textChunksTable.userId, userId), inArray(textChunksTable.chunk, trigrams))),
    );

    const matchCte = db.$with('match_cte').as(
      db
        .select({
          expenseId: expenseTextsTable.expenseId.as('expense_id'),
          totalChunkCount: sum(chunkCte.chunkCount).as('total_chunk_count'),
          sourceMatches: jsonGroupObjectArray({
            chunkCount: chunkCte.chunkCount,
            matchItemName: expenseItemsTable.name,
            matchAdjustmentName: expenseAdjustmentsTable.name,
          }).as('source_matches'),
        })
        .from(chunkCte)
        .innerJoin(expenseTextsTable, eq(chunkCte.textHash, expenseTextsTable.textHash))
        .leftJoin(expenseItemsTable, eq(expenseTextsTable.sourceId, expenseItemsTable.id))
        .leftJoin(expenseAdjustmentsTable, eq(expenseTextsTable.sourceId, expenseAdjustmentsTable.id))
        .groupBy(expenseTextsTable.expenseId),
    );

    const result = await db
      .with(chunkCte, matchCte)
      .select({
        expenseId: matchCte.expenseId,
        totalChunkCount: matchCte.totalChunkCount,
        shopName: expensesTable.shopName,
        shopMall: expensesTable.shopMall,
        sourceMatches: matchCte.sourceMatches,
      })
      .from(matchCte)
      .innerJoin(expensesTable, eq(matchCte.expenseId, expensesTable.id))
      .orderBy(desc(matchCte.totalChunkCount));

    return { searchResult: result };
  });

export const expenseProcedures = {
  loadOptions: loadExpenseOptionsProcedure,
  loadDetail: loadExpenseDetailProcedure,
  save: saveExpenseProcedure,
  list: listExpenseProcedure,
  getSuggestions: getSuggestionsProcedure,
  suggestShopByLocation: suggestShopByLocationProcedure,
  getShopDetail: getShopDetailProcedure,
  inferItemPrice: inferItemPricesProcedure,
  setDelete: setIsDeletedExpenseProcedure,
  search: searchExpenseProcedure,
};
