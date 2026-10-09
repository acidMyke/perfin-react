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
  searchIndexGenerationsTable,
  uploadedFilesTable,
} from '../../db/schema';
import { and, asc, countDistinct, desc, eq, gte } from 'drizzle-orm';
import { lt, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { differenceInDays, endOfMonth } from 'date-fns';
import { caseWhen, coalesce, concat, jsonGroupObjectArray, max } from '../lib/db';
import { processSaveExpense, saveExpenseInputSchema } from './expenses/saveExpense';
import {
  getSuggestions,
  getSuggestionInputSchema,
  searchShopByLocation,
  getShopDetail,
  getItemDetail,
  getItemDetailInputSchema,
  getShopDetailInputSchema,
  searchShopByLocationInputSchema,
  searchExpenseInputSchema,
  searchExpense,
} from './expenses/indexUsage';
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
        categories: jsonGroupObjectArray(
          {
            id: expenseCategoryAllocationsTable.categoryId,
            name: categoriesTable.name,
            isDeleted: categoriesTable.isDeleted,
          },
          { distinct: true },
        ),
        accounts: jsonGroupObjectArray(
          {
            id: expenseAccountAllocationsTable.accountId,
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
  .query(({ ctx, input }) => getSuggestions(ctx, input));

const searchShopByLocationProcedure = protectedProcedure
  .input(searchShopByLocationInputSchema)
  .query(({ input, ctx }) => searchShopByLocation(ctx, input));

const getShopDetailProcedure = protectedProcedure
  .input(getShopDetailInputSchema)
  .query(({ input, ctx }) => getShopDetail(ctx, input));

const getItemDetailProcedure = protectedProcedure
  .input(getItemDetailInputSchema)
  .query(({ input, ctx }) => getItemDetail(ctx, input));

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
  .input(searchExpenseInputSchema)
  .query(async ({ ctx, input }) => searchExpense(ctx, input));

export const expenseProcedures = {
  loadOptions: loadExpenseOptionsProcedure,
  loadDetail: loadExpenseDetailProcedure,
  save: saveExpenseProcedure,
  list: listExpenseProcedure,
  getSuggestions: getSuggestionsProcedure,
  searchShopByLocation: searchShopByLocationProcedure,
  getShopDetail: getShopDetailProcedure,
  getItemDetail: getItemDetailProcedure,
  setDelete: setIsDeletedExpenseProcedure,
  search: searchExpenseProcedure,
};
