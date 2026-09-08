import { protectedProcedure } from '../lib/trpc';
import {
  accountsTable,
  categoriesTable,
  expenseAccountAllocationsTable,
  expenseAdjustmentsTable,
  expenseAttachmentsTable,
  expenseCategoryAllocationsTable,
  expenseItemsTable,
  expensesTable,
  expenseTextsTable,
  searchIndexVersionTable,
  textChunksTable,
  uploadedFilesTable,
} from '../../db/schema';
import { and, asc, avg, count, countDistinct, desc, eq, gte } from 'drizzle-orm';
import { inArray, isNotNull, isNull, lt, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { differenceInDays, endOfMonth } from 'date-fns';
import { GST_NAME, SERVICE_CHARGE_NAME } from '../lib/expenseHelper';
import { caseWhen, coalesce, concat, jsonGroupArray, jsonGroupObjectArray, max, sumAsNumber } from '../lib/db';
import { getLocationBoxId, getTextHash, getTextsHashes, getTrigrams } from '../lib/utils';
import { processSaveExpense, saveExpenseInputSchema } from './expenses/saveExpense';
import { getSuggestions, getSuggestionInputSchema } from './expenses/indexing';
import { filesColumns } from '#server/lib/fileUpload';

export type Option = {
  label: string;
  value: string | null;
};

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
    accountOptions: accountOptions as Option[],
    categoryOptions: categoryOptions as Option[],
  };
});

const loadExpenseDetailProcedure = protectedProcedure
  .input(z.object({ expenseId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;

    const [[expense], items, adjustments, attachmentDetails, accountAllocs, categoryAllocs] = await db.batch([
      db
        .select({
          amountCents: expensesTable.amountCents,
          billedAt: expensesTable.billedAt,
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
          categoryId: expenseItemsTable.categoryId,
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
      db
        .select(filesColumns())
        .from(expenseAttachmentsTable)
        .innerJoin(uploadedFilesTable, eq(expenseAttachmentsTable.fileId, uploadedFilesTable.id))
        .where(and(eq(expenseAttachmentsTable.expenseId, input.expenseId), eq(uploadedFilesTable.userId, userId))),
      db
        .select({
          accountId: expenseAccountAllocationsTable.accountId,
          amountCents: expenseAccountAllocationsTable.amountCents,
        })
        .from(expenseAccountAllocationsTable)
        .where(and(eq(expenseAccountAllocationsTable.expenseId, input.expenseId)))
        .orderBy(expenseAccountAllocationsTable.sequence),
      db
        .select({
          categoryId: expenseCategoryAllocationsTable.categoryId,
          amountCents: expenseCategoryAllocationsTable.amountCents,
        })
        .from(expenseCategoryAllocationsTable)
        .where(and(eq(expenseCategoryAllocationsTable.expenseId, input.expenseId)))
        .orderBy(expenseCategoryAllocationsTable.sequence),
    ]);

    if (!expense) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return { ...expense, items, adjustments, attachmentDetails, accountAllocs, categoryAllocs };
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

    const itemCount = countDistinct(expenseItemsTable.id);
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
        categories: jsonGroupObjectArray(
          {
            id: categoriesTable.id,
            name: categoriesTable.name,
            isDeleted: categoriesTable.isDeleted,
          },
          { distinct: true },
        ),
        accounts: jsonGroupObjectArray(
          {
            id: accountsTable.id,
            name: accountsTable.name,
            isDeleted: accountsTable.isDeleted,
          },
          { distinct: true },
        ),
        createdAt: expensesTable.createdAt,
        isDeleted: expensesTable.isDeleted,
      })
      .from(expensesTable)
      .leftJoin(
        expenseItemsTable,
        and(eq(expensesTable.id, expenseItemsTable.expenseId), eq(expenseItemsTable.isDeleted, false)),
      )
      .leftJoin(expenseAccountAllocationsTable, and(eq(expensesTable.id, expenseAccountAllocationsTable.expenseId)))
      .leftJoin(expenseCategoryAllocationsTable, and(eq(expensesTable.id, expenseCategoryAllocationsTable.expenseId)))
      .leftJoin(accountsTable, eq(expenseAccountAllocationsTable.accountId, accountsTable.id))
      .leftJoin(categoriesTable, eq(expenseCategoryAllocationsTable.categoryId, categoriesTable.id))
      .where(and(...filterList))
      .groupBy(expensesTable.id)
      .orderBy(desc(expensesTable.billedAt));

    return { expenses };
  });

const getSuggestionsProcedure = protectedProcedure
  .input(getSuggestionInputSchema)
  .mutation(({ ctx, input }) => getSuggestions(ctx, input));

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

const searchShopByLocationProcedure = protectedProcedure
  .input(z.object({ latitude: z.number(), longitude: z.number() }))
  .query(async ({ input, ctx }) => {
    const { db, userId } = ctx;
    const queryBoxIds = getLocationBoxId(input);
    const result = await db
      .select({
        shopName: sql<string>`${expensesTable.shopName}`,
        shopMall: expensesTable.shopMall,
        latitude: avg(expensesTable.latitude).mapWith(expensesTable.latitude),
        longitude: avg(expensesTable.longitude).mapWith(expensesTable.longitude),
      })
      .from(expensesTable)
      .where(
        and(
          isNotNull(expensesTable.shopName),
          eq(expensesTable.userId, userId),
          inArray(expensesTable.boxId, queryBoxIds),
        ),
      )
      .groupBy(expensesTable.shopName, expensesTable.shopMall);

    return {
      result,
    };
  });

const getShopDetailProcedure = protectedProcedure
  .input(z.object({ shopName: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;
    const shopNameHash = await getTextHash(userId, input.shopName);
    const expensesCte = db.$with('expense_id_cte').as(
      db
        .selectDistinct({ expenseId: expenseTextsTable.expenseId.as('expense_id') })
        .from(expenseTextsTable)
        .innerJoin(expensesTable, eq(expenseTextsTable.expenseId, expensesTable.id))
        .where(eq(expenseTextsTable.textHash, shopNameHash))
        .orderBy(desc(expensesTable.billedAt))
        .limit(1),
    );

    const adjustmentsCte = db.$with('adjustments_cte').as(
      db
        .select({
          isGstExcluded: max(
            caseWhen(eq(expenseAdjustmentsTable.name, GST_NAME), sql<number>`1`).else(sql<number>`0`),
          ).as('is_gst'),
          serviceChargeBps: max(
            caseWhen<number>(eq(expenseAdjustmentsTable.name, SERVICE_CHARGE_NAME), expenseAdjustmentsTable.rateBps),
          ).as('service_charge'),
        })
        .from(expensesCte)
        .leftJoin(
          expenseAdjustmentsTable,
          and(
            eq(expenseAdjustmentsTable.isInferable, true),
            eq(expensesCte.expenseId, expenseAdjustmentsTable.expenseId),
          ),
        )
        .groupBy(expenseAdjustmentsTable.expenseId),
    );

    const accountsCte = db.$with('accounts_cte').as(
      db
        .select({ accountIds: jsonGroupArray(expenseAccountAllocationsTable.accountId).as('accountIds') })
        .from(expensesCte)
        .leftJoin(expenseAccountAllocationsTable, eq(expensesCte.expenseId, expenseAccountAllocationsTable.expenseId))
        .groupBy(expenseAccountAllocationsTable.expenseId),
    );

    const categoriesCte = db.$with('categories_cte').as(
      db
        .select({ categoryIds: jsonGroupArray(expenseCategoryAllocationsTable.categoryId).as('categoryIds') })
        .from(expensesCte)
        .leftJoin(expenseCategoryAllocationsTable, eq(expensesCte.expenseId, expenseCategoryAllocationsTable.expenseId))
        .groupBy(expenseCategoryAllocationsTable.expenseId),
    );

    const data = await db
      .with(expensesCte, adjustmentsCte, accountsCte, categoriesCte)
      .select({
        accountIds: accountsCte.accountIds,
        categoryIds: categoriesCte.categoryIds,
        isGstExcluded: adjustmentsCte.isGstExcluded,
        serviceChargeBps: adjustmentsCte.serviceChargeBps,
      })
      .from(adjustmentsCte)
      .crossJoin(accountsCte)
      .crossJoin(categoriesCte);

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
  .input(z.object({ query: z.string(), cursor: z.string().nullish() }))
  .query(async ({ ctx, input }) => {
    const { db, userId } = ctx;
    const query = input.query.trim();
    if (query.length < 3) return { searchResult: [] };

    const trigrams = getTrigrams(query, { unlimited: true });

    const chunkCte = db.$with('chunk_cte').as(
      db
        .select({
          textHash: textChunksTable.textHash.as('text_hash'),
          chunkCount: sql<number>`sum(length(${textChunksTable.chunk}) / 3.0)`.as('chunk_count'),
        })
        .from(textChunksTable)
        .groupBy(textChunksTable.textHash)
        .where(and(eq(textChunksTable.userId, userId), inArray(textChunksTable.chunk, trigrams)))
        .having(sql`chunk_count > 1`),
    );

    const matchCte = db.$with('match_cte').as(
      db
        .select({
          expenseId: expenseTextsTable.expenseId.as('expense_id'),
          totalChunkCount: sumAsNumber(chunkCte.chunkCount).as('total_chunk_count'),
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
        amountCents: expensesTable.amountCents,
        billedAt: expensesTable.billedAt,
      })
      .from(matchCte)
      .innerJoin(expensesTable, eq(matchCte.expenseId, expensesTable.id))
      .orderBy(desc(matchCte.totalChunkCount), desc(expensesTable.billedAt));

    return { searchResult: result };
  });

const listReindexHistoryProcedure = protectedProcedure.query(async ({ ctx }) => {
  const { db, userId } = ctx;

  return db
    .select({
      version: searchIndexVersionTable.version,
      createdAt: searchIndexVersionTable.createdAt,
      completedAt: searchIndexVersionTable.completedAt,
      recordsProcessed: searchIndexVersionTable.recordsProcessed,
      totalDeletedCount: searchIndexVersionTable.totalDeletedCount,
      deletedExpenseTextsCount: searchIndexVersionTable.deletedExpenseTextsCount,
    })
    .from(searchIndexVersionTable)
    .where(eq(searchIndexVersionTable.userId, userId))
    .orderBy(desc(searchIndexVersionTable.version));
});

const reindexExpenseProcedure = protectedProcedure.mutation(async ({ ctx }) => {
  const { db, env, userId } = ctx;

  const [{ version = 0, createdAt = new Date(0) } = {}] = await db
    .select({
      version: max(searchIndexVersionTable.version),
      createdAt: max(searchIndexVersionTable.createdAt).mapWith(searchIndexVersionTable.createdAt),
    })
    .from(searchIndexVersionTable)
    .where(eq(searchIndexVersionTable.userId, userId));

  if (differenceInDays(new Date(), createdAt) < 7) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot reindex within 7 days of last reindex',
    });
  }

  const newVersion = version + 1;
  const payload = { userId, version: newVersion };
  await db.insert(searchIndexVersionTable).values(payload);
  await env.EXPENSE_REINDEXER.create({ params: payload });

  return { newVersion };
});

export const expenseProcedures = {
  loadOptions: loadExpenseOptionsProcedure,
  loadDetail: loadExpenseDetailProcedure,
  save: saveExpenseProcedure,
  list: listExpenseProcedure,
  getSuggestions: getSuggestionsProcedure,
  suggestShopByLocation: suggestShopByLocationProcedure,
  searchShopByLocation: searchShopByLocationProcedure,
  getShopDetail: getShopDetailProcedure,
  inferItemPrice: inferItemPricesProcedure,
  setDelete: setIsDeletedExpenseProcedure,
  search: searchExpenseProcedure,
  reindex: reindexExpenseProcedure,
  reindexList: listReindexHistoryProcedure,
};
