import { protectedProcedure } from '../lib/trpc';
import {
  accountsTable,
  categoriesTable,
  expenseAdjustmentsTable,
  expenseItemsTable,
  expensesTable,
  generateId,
  searchTable,
} from '../../db/schema';
import { and, asc, count, desc, eq, gte, inArray, isNull, like, lt, max, notInArray, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { endOfMonth, parseISO } from 'date-fns';
import { calculateExpense } from '../lib/expenseHelper';
import { caseWhen, coalesce, concat, excludedAll } from '../lib/db';
import { getLocationBoxId, getTrigrams } from '../lib/utils';
import type { BatchItem } from 'drizzle-orm/batch';

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
          latitude: expensesTable.latitude,
          longitude: expensesTable.longitude,
          geoAccuracy: expensesTable.geoAccuracy,
          shopName: expensesTable.shopName,
          shopMall: expensesTable.shopMall,
          version: expensesTable.version,
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
      type: z.enum(['online', 'physical']),
      additionalServiceChargePercent: z.number().nullable().default(null),
      isGstExcluded: z.boolean().nullable().default(false),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          priceCents: z.int().min(0, { error: 'Must be non-negative value' }),
          quantity: z.int().min(0, { error: 'Must be non-negative value' }),
          isDeleted: z.boolean().optional().default(false),
        }),
      ),
      adjustments: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            amountCents: z.int().default(0),
            rateBps: z.int().optional(),
            expenseItemId: z
              .string()
              .nullish()
              .transform(v => v ?? undefined),
            isDeleted: z.boolean().default(false).optional(),
          }),
        )
        .default([]),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const existingSearchableSet = new Set<string>();
    if (input.expenseId !== 'create') {
      const [existing] = await db.batch([
        db.query.expensesTable.findFirst({
          where: { id: input.expenseId, userId },
          columns: { userId: true, isDeleted: true, version: true, shopName: true, shopMall: true },
        }),
      ]);

      if (!existing) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      if (existing.version > input.version) {
        throw new TRPCError({ code: 'CONFLICT' });
      }

      if (existing.shopMall) {
        existingSearchableSet.add(existing.shopMall);
      }

      if (existing.shopName) {
        existingSearchableSet.add(existing.shopName);
      }

      const otherExistingSearchables = await db
        .select({ text: expenseItemsTable.name })
        .from(expenseItemsTable)
        .where(eq(expenseItemsTable.expenseId, input.expenseId))
        .union(
          db
            .select({ text: expenseAdjustmentsTable.name })
            .from(expenseAdjustmentsTable)
            .where(eq(expenseAdjustmentsTable.expenseId, input.expenseId)),
        );

      for (const { text } of otherExistingSearchables) {
        existingSearchableSet.add(text);
      }
    } else {
      input.expenseId = generateId();
    }

    const searchables: { type: string; text: string; context?: string | null }[] = [];
    if (
      input.shopName &&
      existingSearchableSet.has(input.shopName) &&
      (!input.shopMall || existingSearchableSet.has(input.shopMall))
    ) {
      searchables.push({ type: 'shopName', text: input.shopName, context: input.shopMall });
    }

    if (input.shopMall && existingSearchableSet.has(input.shopMall)) {
      searchables.push({ type: 'shopMall', text: input.shopMall });
    }

    const activeIds: string[] = [];

    for (const item of input.items) {
      if (item.id === 'create') {
        item.id = generateId();
      }
      activeIds.push(item.id);
      if (!existingSearchableSet.has(item.name) && (!input.shopName || !existingSearchableSet.has(input.shopName))) {
        searchables.push({ type: 'itemName', text: item.name, context: input.shopName });
        existingSearchableSet.add(item.name);
      }
    }

    for (const adj of input.adjustments) {
      if (adj.id === 'create') {
        adj.id = generateId();
      }
      activeIds.push(adj.id!);
      if (!existingSearchableSet.has(adj.name)) {
        searchables.push({ type: 'adjustmentName', text: adj.name, context: input.shopName });
        existingSearchableSet.add(adj.name);
      }
    }

    const batchItems: BatchItem<'sqlite'>[] = [];

    if (input.account?.value === 'create') {
      input.account.value = generateId();
      batchItems.push(
        db.insert(accountsTable).values({ id: input.account.value, name: input.account.label, userId: userId }),
      );
    }

    if (input.category?.value === 'create') {
      input.category.value = generateId();
      batchItems.push(
        db.insert(categoriesTable).values({ id: input.category.value, name: input.category.label, userId: userId }),
      );
    }

    const accountId = input.account?.value ?? null;
    const categoryId = input.category?.value ?? null;

    const { grossAmountCents } = calculateExpense(input);
    const [boxId] =
      input.latitude && input.longitude
        ? getLocationBoxId({ latitude: input.latitude, longitude: input.longitude })
        : [null];

    batchItems.push(
      db
        .insert(expensesTable)
        .values({
          id: input.expenseId,
          amountCents: grossAmountCents,
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
        }),
    );

    batchItems.push(
      db
        .insert(expenseItemsTable)
        .values(
          input.items.map((item, idx) => ({
            userId,
            ...item,
            sequence: idx,
            expenseId: input.expenseId,
            shopName: input.shopName ?? '',
          })),
        )
        .onConflictDoUpdate({
          target: expenseItemsTable.id,
          set: excludedAll(expenseItemsTable),
        }),
    );

    batchItems.push(
      db
        .update(expenseItemsTable)
        .set({ isDeleted: true })
        .where(and(eq(expenseItemsTable.expenseId, input.expenseId), notInArray(expenseItemsTable.id, activeIds))),
    );

    batchItems.push(
      db
        .insert(expenseAdjustmentsTable)
        .values(
          input.adjustments.map((adj, idx) => ({
            userId,
            ...adj,
            sequence: idx,
            expenseId: input.expenseId,
            shopName: input.shopName ?? '',
          })),
        )
        .onConflictDoUpdate({
          target: expenseItemsTable.id,
          set: excludedAll(expenseItemsTable),
        }),
    );

    batchItems.push(
      db
        .update(expenseAdjustmentsTable)
        .set({ isDeleted: true })
        .where(
          and(
            eq(expenseAdjustmentsTable.expenseId, input.expenseId),
            notInArray(expenseAdjustmentsTable.id, activeIds),
          ),
        ),
    );

    if (searchables.length) {
      const records = searchables.flatMap(({ text, type, context }) =>
        getTrigrams(text).map(chunk => ({ userId, chunk, text, type, context: context ?? '' })),
      );

      // each record have 6 params, cloudflare D1 max params is 100.
      // 100 / 6 = 16.666, keep it safe, insert records in batches of 15 to stay under D1's 100-parameter limit
      const groupSize = 15;
      const groupsCount = Math.ceil(records.length / groupSize);
      for (let i = 0; i < groupsCount; i++) {
        const values = records.slice(i * groupSize, (i + 1) * groupSize);
        batchItems.push(
          db
            .insert(searchTable)
            .values(values)
            .onConflictDoUpdate({
              target: [searchTable.chunk, searchTable.text, searchTable.type, searchTable.userId, searchTable.context],
              set: { usageCount: sql`${searchTable.usageCount} + 1` },
            }),
        );
      }
    }

    // @ts-ignore
    await db.batch(batchItems);
  });

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
      type: z.enum(['shopName', 'shopMall', 'itemName', 'refundSource']),
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

    const trigrams = search && getTrigrams(search);

    const condition = and(
      eq(searchTable.userId, userId),
      eq(searchTable.type, input.type),
      trigrams ? inArray(searchTable.chunk, trigrams) : undefined,
      context ? eq(searchTable.context, context) : undefined,
    );

    const descLikelyness = desc(max(caseWhen(like(searchTable.text, search + '%'), sql.raw('1')).else(sql.raw('0'))));
    const descMatchCount = desc(max(searchTable.usageCount));
    const descPopularity = desc(count(searchTable.chunk));

    let query = db.select({ value: searchTable.text }).from(searchTable).where(condition).groupBy(searchTable.text);

    if (trigrams.length > 5) {
      // @ts-expect-error query with having cant be assigned back to query
      query = query.having(gte(searchTable.usageCount, trigrams.length - 5));
    }

    if (context && search) {
      const hasMatchingContext = max(
        caseWhen(eq(searchTable.context, context), sql.raw('0'))
          .whenThen(isNull(searchTable.context), sql.raw('1'))
          .else(sql.raw('2')),
      );
      // @ts-expect-error query with orderBy cant be assigned back to query
      query = query.orderBy(hasMatchingContext, descLikelyness, descMatchCount, descPopularity);
    } else if (search) {
      // @ts-expect-error query with orderBy cant be assigned back to query
      query = query.orderBy(descLikelyness, descMatchCount, descPopularity);
    } else {
      // @ts-expect-error query with orderBy cant be assigned back to query
      query = query.orderBy(descMatchCount, descPopularity);
    }

    const suggestions = await query;
    return { suggestions: suggestions.map(({ value }) => value) };
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
