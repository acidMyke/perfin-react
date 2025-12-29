import { FormInputError, protectedProcedure, type ProtectedContext } from '../lib/trpc';
import {
  accountsTable,
  categoriesTable,
  expenseItemsTable,
  expenseRefundsTable,
  expensesTable,
  generateId,
  searchTable,
} from '../../db/schema';
import { and, asc, count, desc, eq, gte, inArray, isNull, like, lt, max, notInArray, or, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { endOfMonth, parseISO } from 'date-fns';
import { calculateExpense, calculateExpenseItem } from '../lib/expenseHelper';
import { caseWhen, coalesce, concat, excludedAll } from '../lib/db';
import { getLocationBoxId, getTrigrams } from '../lib/utils';

type Option = {
  label: string;
  value: string;
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
    accountOptions,
    categoryOptions,
  };
});

const loadExpenseDetailProcedure = protectedProcedure
  .input(z.object({ expenseId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;

    const [[expense], rawItems, rawRefunds] = await db.batch([
      db
        .select({
          amountCents: expensesTable.amountCents,
          amountCentsPreRefund: expensesTable.amountCentsPreRefund,
          billedAt: expensesTable.billedAt,
          accountId: expensesTable.accountId,
          categoryId: expensesTable.categoryId,
          latitude: expensesTable.latitude,
          longitude: expensesTable.longitude,
          geoAccuracy: expensesTable.geoAccuracy,
          shopMall: expensesTable.shopMall,
          shopName: expensesTable.shopName,
          version: expensesTable.version,
          isGstExcluded: expensesTable.isGstExcluded,
          additionalServiceChargePercent: expensesTable.additionalServiceChargePercent,
          isDeleted: expensesTable.isDeleted,
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
          itemRefundId: expenseItemsTable.expenseRefundId,
        })
        .from(expenseItemsTable)
        .where(and(eq(expenseItemsTable.expenseId, input.expenseId), eq(expenseItemsTable.isDeleted, false))),
      db
        .select({
          id: expenseRefundsTable.id,
          source: expenseRefundsTable.source,
          expectedAmountCents: expenseRefundsTable.expectedAmountCents,
          actualAmountCents: expenseRefundsTable.actualAmountCents,
          isDeleted: expenseRefundsTable.isDeleted,
          expenseItemId: expenseRefundsTable.expenseItemId,
        })
        .from(expenseRefundsTable)
        .where(and(eq(expenseRefundsTable.expenseId, input.expenseId), eq(expenseRefundsTable.isDeleted, false))),
    ]);

    if (!expense) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const items = rawItems.map(({ itemRefundId, ...item }) => ({
      ...item,
      expenseRefund: itemRefundId
        ? rawRefunds.splice(
            rawRefunds.findIndex(({ id }) => id == itemRefundId),
            1,
          )[0]
        : null,
    }));

    return {
      ...expense,
      items,
      refunds: rawRefunds,
    };
  });

async function safelyCreateSubject(
  ctx: ProtectedContext,
  table: typeof accountsTable | typeof categoriesTable,
  { value, label }: Option,
  field: string,
): Promise<string> {
  const { db, userId } = ctx;
  if (value !== 'create') return value;
  const existings = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.userId, userId), like(table.name, label), eq(table.isDeleted, false)))
    .limit(1);

  if (existings.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      cause: new FormInputError({
        fieldErrors: { [field]: [`${label} existed`] },
      }),
    });
  }

  const newRecord = await db.insert(table).values({ name: label, userId: userId }).returning({ id: table.id });
  return newRecord[0].id;
}

const saveExpenseProcedure = protectedProcedure
  .input(
    z.object({
      expenseId: z.string(),
      version: z.int().optional().default(0),
      billedAt: z.iso.datetime({ error: 'Invalid date time' }).transform(val => parseISO(val)),
      account: z
        .object({ value: z.string(), label: z.string() })
        .nullish()
        .transform(v => v ?? null),
      category: z
        .object({ value: z.string(), label: z.string() })
        .nullish()
        .transform(v => v ?? null),
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
      geoAccuracy: z.number().nullish(),
      shopName: z.string().nullish(),
      shopMall: z.string().nullish(),
      additionalServiceChargePercent: z.number().nullable().default(null),
      isGstExcluded: z.boolean().nullable().default(false),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          priceCents: z.int().min(0, { error: 'Must be non-negative value' }),
          quantity: z.int().min(0, { error: 'Must be non-negative value' }),
          isDeleted: z.boolean().optional().default(false),
          expenseRefundId: z.string().optional(),
          expenseRefund: z
            .object({
              id: z.string(),
              source: z.string(),
              expectedAmountCents: z.int().min(0, { error: 'Must be non-negative value' }),
              actualAmountCents: z
                .int()
                .min(0, { error: 'Must be non-negative value' })
                .nullish()
                .transform(v => v ?? null),
              confirmedAt: z.iso
                .datetime({ error: 'Invalid date time' })
                .nullish()
                .transform(val => (val ? parseISO(val) : null)),
            })
            .nullable(),
        }),
      ),
      refunds: z
        .array(
          z.object({
            id: z.string(),
            source: z.string(),
            expectedAmountCents: z.int().min(0, { error: 'Must be non-negative value' }),
            actualAmountCents: z
              .int()
              .min(0, { error: 'Must be non-negative value' })
              .nullish()
              .transform(v => v ?? null),
            confirmedAt: z.iso
              .datetime({ error: 'Invalid date time' })
              .nullish()
              .transform(val => (val ? parseISO(val) : null)),
            note: z
              .string()
              .nullish()
              .transform(v => v ?? null)
              .optional(),
            isDeleted: z.boolean().default(false).optional(),
            expenseItemId: z
              .string()
              .nullish()
              .transform(v => v ?? null),
          }),
        )
        .default([]),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    if (input.expenseId !== 'create') {
      const existing = await db.query.expensesTable.findFirst({
        where: { id: input.expenseId, userId },
        columns: { userId: true, isDeleted: true, version: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      if (existing.version > input.version) {
        throw new TRPCError({ code: 'CONFLICT' });
      }
    } else {
      input.expenseId = generateId();
    }

    const searchables: { type: string; text: string; context?: string | null }[] = [];
    if (input.shopName) searchables.push({ type: 'shopName', text: input.shopName, context: input.shopMall });
    if (input.shopMall) searchables.push({ type: 'shopMall', text: input.shopMall });

    const refunds: Omit<typeof expenseRefundsTable.$inferInsert, 'expenseId' | 'sequence'>[] = [...input.refunds];
    const activeIds: string[] = [];

    for (const item of input.items) {
      if (item.id === 'create') {
        item.id = generateId();
      }
      activeIds.push(item.id);
      searchables.push({ type: 'itemName', text: item.name, context: input.shopName });
      if (item.expenseRefund) {
        if (item.expenseRefund.id === 'create') {
          item.expenseRefund.id = generateId();
        }
        item.expenseRefundId = item.expenseRefund.id;

        const { grossAmountCents } = calculateExpenseItem(item, input);

        refunds.push({
          ...item.expenseRefund,
          expectedAmountCents: grossAmountCents,
          expenseItemId: item.id,
        });
      }
    }

    for (const refund of refunds) {
      if (refund.id === 'create') {
        refund.id = generateId();
      }
      activeIds.push(refund.id!);
      searchables.push({ type: 'refundSource', text: refund.source, context: input.shopName });
      if (refund.actualAmountCents && !refund.confirmedAt) {
        refund.confirmedAt = new Date();
      }
    }

    const [accountId, categoryId] = await Promise.all([
      input.account ? safelyCreateSubject(ctx, accountsTable, input.account, 'accountId') : null,
      input.category ? safelyCreateSubject(ctx, categoriesTable, input.category, 'categoryId') : null,
    ]);

    const { amountCents, grossAmountCents } = calculateExpense(input);
    const [boxId] =
      input.latitude && input.longitude
        ? getLocationBoxId({ latitude: input.latitude, longitude: input.longitude })
        : [null];

    await db
      .insert(expensesTable)
      .values({
        id: input.expenseId,
        amountCents,
        amountCentsPreRefund: grossAmountCents,
        billedAt: input.billedAt,
        userId: userId,
        accountId: accountId,
        categoryId: categoryId,
        updatedBy: userId,
        latitude: input.latitude,
        longitude: input.longitude,
        geoAccuracy: input.geoAccuracy,
        boxId,
        shopName: input.shopName,
        shopMall: input.shopMall,
        additionalServiceChargePercent: input.additionalServiceChargePercent,
        isGstExcluded: input.isGstExcluded,
      })
      .onConflictDoUpdate({
        target: expensesTable.id,
        set: excludedAll(expensesTable, ['userId']),
      });

    await db
      .insert(expenseItemsTable)
      .values(
        input.items.map((item, idx) => ({
          ...item,
          sequence: idx,
          expenseId: input.expenseId,
        })),
      )
      .onConflictDoUpdate({
        target: expenseItemsTable.id,
        set: excludedAll(expenseItemsTable),
      });

    await db
      .update(expenseItemsTable)
      .set({ isDeleted: true })
      .where(and(eq(expenseItemsTable.expenseId, input.expenseId), notInArray(expenseItemsTable.id, activeIds)));

    if (refunds.length > 0) {
      await db
        .insert(expenseRefundsTable)
        .values(
          refunds.map((refund, idx) => ({
            ...refund,
            sequence: idx,
            expenseId: input.expenseId,
          })),
        )
        .onConflictDoUpdate({
          target: expenseRefundsTable.id,
          set: excludedAll(expenseRefundsTable),
        });
    }

    await db
      .update(expenseRefundsTable)
      .set({ isDeleted: true })
      .where(and(eq(expenseRefundsTable.expenseId, input.expenseId), notInArray(expenseRefundsTable.id, activeIds)));

    if (searchables.length) {
      for (const { text, type, context } of searchables) {
        await db
          .insert(searchTable)
          .values(getTrigrams(text).map(chunk => ({ userId, chunk, text, type, context: context ?? '' })))
          .onConflictDoUpdate({
            target: [searchTable.chunk, searchTable.text, searchTable.type, searchTable.userId, searchTable.context],
            set: { usageCount: sql`${searchTable.usageCount} + 1` },
          });
      }
    }
  });

const listExpenseProcedure = protectedProcedure
  .input(
    z.object({
      month: z.number().min(0).max(11),
      year: z.number().min(2020),
      showDeleted: z.boolean().optional().default(false),
    }),
  )
  .query(async ({ input, ctx }) => {
    const { db } = ctx;
    const userId = ctx.user.id;
    const { year, month, showDeleted } = input;
    const filterStart = new Date(year, month, 1, 0, 0, 0);
    const filterEnd = endOfMonth(filterStart);

    const filterList: (SQL | undefined)[] = [
      eq(expensesTable.userId, userId),
      gte(expensesTable.billedAt, filterStart),
      lt(expensesTable.billedAt, filterEnd),
      !showDeleted ? eq(expensesTable.isDeleted, false) : undefined,
    ];

    const itemCount = count(expenseItemsTable.id);
    const itemOne = max(caseWhen(eq(expenseItemsTable.sequence, sql.raw('0')), expenseItemsTable.name));
    const itemTwo = max(caseWhen(eq(expenseItemsTable.sequence, sql.raw('1')), expenseItemsTable.name));

    const expenses = await db
      .select({
        id: expensesTable.id,
        description: caseWhen(eq(itemCount, sql.raw('1')), itemOne)
          .whenThen(eq(itemCount, sql.raw('2')), concat(itemOne, sql.raw("' and '"), itemTwo))
          .else(concat(itemOne, sql.raw("' and '"), sql`(${itemCount} - 1)`, sql.raw("' items'"))),
        shopDetail: concat(expensesTable.shopName, coalesce(concat(sql.raw("' @ '"), expensesTable.shopMall))),
        amount: sql<number>`ROUND(${expensesTable.amountCents} / CAST(100 AS REAL), 2)`,
        billedAt: expensesTable.billedAt,
        account: {
          name: accountsTable.name,
          isDeleted: accountsTable.isDeleted,
        },
        category: {
          name: categoriesTable.name,
          isDeleted: categoriesTable.isDeleted,
        },
        createdAt: expensesTable.createdAt,
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

    return {
      expenses,
    };
  });

const getSuggestionsProcedure = protectedProcedure
  .input(
    z.object({
      type: z.enum(['shopName', 'shopMall', 'itemName', 'refundSource']),
      search: z.string(),
      context: z.string().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const condition = and(
      eq(searchTable.userId, userId),
      eq(searchTable.type, input.type),
      input.search ? inArray(searchTable.chunk, getTrigrams(input.search)) : undefined,
    );

    const descLikelyness = desc(
      max(caseWhen(like(searchTable.text, input.search + '%'), sql.raw('1')).else(sql.raw('0'))),
    );
    const descMatchCount = desc(max(searchTable.usageCount));
    const descPopularity = desc(count(searchTable.chunk));

    let suggestions: { value: string }[];
    if (input.context) {
      const hasMatchingContext = max(
        caseWhen(eq(searchTable.context, input.context), sql.raw('0'))
          .whenThen(isNull(searchTable.context), sql.raw('1'))
          .else(sql.raw('2')),
      );
      suggestions = await db
        .select({ value: searchTable.text })
        .from(searchTable)
        .where(condition)
        .groupBy(searchTable.text)
        .orderBy(hasMatchingContext, descLikelyness, descMatchCount, descPopularity);
    } else {
      suggestions = await db
        .select({ value: searchTable.text })
        .from(searchTable)
        .where(condition)
        .groupBy(searchTable.text)
        .orderBy(descLikelyness, descMatchCount, descPopularity);
    }

    return {
      ...input,
      suggestions: suggestions.map(({ value }) => value),
    };
  });

const inferShopDetailsProcedure = protectedProcedure
  .input(
    z.object({
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),

      shopName: z.string().nullish(),

      itemNames: z.array(z.string()).optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const itemNames =
      input.itemNames?.reduce((acc, name) => {
        const trimmed = name.trim();
        if (trimmed.length) acc.push(trimmed.toUpperCase());
        return acc;
      }, [] as string[]) ?? [];

    // Infer shop / mall and shopdetails by coordinate
    if (!input.shopName && input.latitude && input.longitude) {
      const boxIds = getLocationBoxId({ latitude: input.latitude, longitude: input.longitude }, true);

      const nearbyShopsColumns = {
        shopName: expensesTable.shopName,
        shopMall: expensesTable.shopMall,
        additionalServiceChargePercent: expensesTable.additionalServiceChargePercent,
        isGstExcluded: expensesTable.isGstExcluded,
        categoryId: expensesTable.categoryId,
        accountId: expensesTable.accountId,
      } as const;
      const nearbyShopsCondition = and(eq(expensesTable.userId, userId), inArray(expensesTable.boxId, boxIds));

      const distance = sql<number>`min((${expensesTable.latitude} - ${input.latitude}) * (${expensesTable.latitude} - ${input.latitude})
                    + (${expensesTable.longitude} - ${input.longitude}) * (${expensesTable.longitude} - ${input.longitude}))`;

      const groupByColumns = [
        nearbyShopsColumns.shopName,
        nearbyShopsColumns.categoryId,
        nearbyShopsColumns.accountId,
      ] as const;

      if (itemNames.length === 0) {
        return await db
          .select(nearbyShopsColumns)
          .from(expensesTable)
          .where(nearbyShopsCondition)
          .groupBy(...groupByColumns)
          .orderBy(distance, desc(max(expensesTable.billedAt)))
          .limit(5);
      } else {
        const hasMatchingItems = sql<number>`MIN(CASE WHEN ${inArray(expenseItemsTable.name, itemNames)} THEN 0 ELSE 1 END)`;
        return await db
          .select(nearbyShopsColumns)
          .from(expensesTable)
          .leftJoin(expenseItemsTable, eq(expensesTable.id, expenseItemsTable.expenseId))
          .where(nearbyShopsCondition)
          .groupBy(...groupByColumns)
          .orderBy(hasMatchingItems, distance, desc(max(expensesTable.billedAt)))
          .limit(5);
      }
    } else if (input.shopName) {
      // Infer shop detail by shop name
      return await db
        .selectDistinct({
          additionalServiceChargePercent: expensesTable.additionalServiceChargePercent,
          isGstExcluded: expensesTable.isGstExcluded,
          categoryId: expensesTable.categoryId,
          accountId: expensesTable.accountId,
        })
        .from(expensesTable)
        .where(and(eq(expensesTable.userId, userId), eq(expensesTable.shopName, input.shopName.trim().toUpperCase())))
        .orderBy(desc(expensesTable.billedAt))
        .limit(5);
    }
    throw new TRPCError({ code: 'BAD_REQUEST' });
  });

const inferItemPricesProcedure = protectedProcedure
  .input(z.object({ itemName: z.string(), shopName: z.string().nullish() }))
  .mutation(({ input, ctx }) => {
    const { db, userId } = ctx;
    const itemName = input.itemName.trim().toUpperCase();
    return db
      .select({ priceCents: expenseItemsTable.priceCents, billedAt: max(expensesTable.billedAt), count: count() })
      .from(expenseItemsTable)
      .innerJoin(expensesTable, eq(expenseItemsTable.expenseId, expensesTable.id))
      .where(
        and(
          eq(expensesTable.userId, userId),
          eq(expenseItemsTable.name, itemName),
          input.shopName ? eq(expensesTable.shopName, input.shopName.trim().toUpperCase()) : undefined,
        ),
      )
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

export const expenseProcedures = {
  loadOptions: loadExpenseOptionsProcedure,
  loadDetail: loadExpenseDetailProcedure,
  save: saveExpenseProcedure,
  list: listExpenseProcedure,
  getSuggestions: getSuggestionsProcedure,
  inferShopDetail: inferShopDetailsProcedure,
  inferItemPrice: inferItemPricesProcedure,
  setDelete: setIsDeletedExpenseProcedure,
};
