import { FormInputError, protectedProcedure, type ProtectedContext } from '../trpc';
import {
  accountsTable,
  categoriesTable,
  expenseItemsTable,
  expenseRefundsTable,
  expensesTable,
  generateId,
} from '../../db/schema';
import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  max,
  notInArray,
  sql,
  SQL,
  type AnyColumn,
} from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { endOfMonth, parseISO } from 'date-fns';
import { excludedAll } from '../lib/utils';
import { calculateExpense, calculateExpenseItem } from '../lib/expenseHelper';
import { caseWhen, coalesce, concat } from '../lib/SqlExtension';

type Option = {
  label: string;
  value: string;
};

const loadExpenseOptionsProcedure = protectedProcedure.query(async ({ ctx: { db, user } }) => {
  const [accountOptions, categoryOptions] = await db.batch([
    db
      .select({ value: accountsTable.id, label: accountsTable.name })
      .from(accountsTable)
      .where(and(eq(accountsTable.belongsToId, user.id), eq(accountsTable.isDeleted, false)))
      .orderBy(asc(accountsTable.sequence), asc(accountsTable.createdAt)),
    db
      .select({ value: categoriesTable.id, label: categoriesTable.name })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.belongsToId, user.id), eq(categoriesTable.isDeleted, false)))
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
    const expense = await db.query.expensesTable.findFirst({
      where: and(eq(expensesTable.belongsToId, userId), eq(expensesTable.id, input.expenseId)),
      columns: {
        amountCents: true,
        amountCentsPreRefund: true,
        billedAt: true,
        accountId: true,
        categoryId: true,
        latitude: true,
        longitude: true,
        geoAccuracy: true,
        shopMall: true,
        shopName: true,
        version: true,
        isGstExcluded: true,
        additionalServiceChargePercent: true,
      },
      with: {
        items: {
          where: eq(expenseItemsTable.isDeleted, false),
          orderBy: asc(expenseItemsTable.sequence),
          columns: {
            id: true,
            name: true,
            quantity: true,
            priceCents: true,
            isDeleted: true,
          },
          with: {
            expenseRefund: {
              columns: {
                id: true,
                source: true,
                expectedAmountCents: true,
                actualAmountCents: true,
                confirmedAt: true,
              },
            },
          },
        },
        refunds: {
          where: and(eq(expenseRefundsTable.isDeleted, false), isNull(expenseRefundsTable.expenseItemId)),
          orderBy: asc(expenseRefundsTable.sequence),
          columns: {
            id: true,
            source: true,
            expectedAmountCents: true,
            actualAmountCents: true,
            confirmedAt: true,
            note: true,
            isDeleted: true,
            expenseItemId: true,
          },
        },
      },
    });

    if (!expense) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return expense;
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
    .where(and(eq(table.belongsToId, userId), like(table.name, label), eq(table.isDeleted, false)))
    .limit(1);

  if (existings.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      cause: new FormInputError({
        fieldErrors: { [field]: [`${label} existed`] },
      }),
    });
  }

  const newRecord = await db.insert(table).values({ name: label, belongsToId: userId }).returning({ id: table.id });
  return newRecord[0].id;
}

const saveExpenseProcedure = protectedProcedure
  .input(
    z.object({
      expenseId: z.string(),
      version: z.int().optional().default(0),
      isDeleted: z.boolean().optional().default(false),
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
    const { user, db } = ctx;
    const userId = user.id;

    if (input.expenseId !== 'create') {
      const existing = await db.query.expensesTable.findFirst({
        where: and(eq(expensesTable.id, input.expenseId)),
        columns: {
          belongsToId: true,
          isDeleted: true,
          version: true,
        },
      });

      if (existing?.belongsToId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      if (existing.version > input.version) {
        throw new TRPCError({ code: 'CONFLICT' });
      }
    } else {
      input.expenseId = generateId();
    }

    const refunds: Omit<typeof expenseRefundsTable.$inferInsert, 'expenseId' | 'sequence'>[] = [...input.refunds];
    const activeIds: string[] = [];

    for (const item of input.items) {
      if (item.id === 'create') {
        item.id = generateId();
      }
      activeIds.push(item.id);
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
      if (refund.id) {
        activeIds.push(refund.id);
      }
      if (refund.actualAmountCents && !refund.confirmedAt) {
        refund.confirmedAt = new Date();
      }
    }

    const [accountId, categoryId] = await Promise.all([
      input.account ? safelyCreateSubject(ctx, accountsTable, input.account, 'accountId') : null,
      input.category ? safelyCreateSubject(ctx, categoriesTable, input.category, 'categoryId') : null,
    ]);

    const { amountCents, grossAmountCents } = calculateExpense(input);

    await db
      .insert(expensesTable)
      .values({
        id: input.expenseId,
        amountCents,
        amountCentsPreRefund: grossAmountCents,
        billedAt: input.billedAt,
        belongsToId: userId,
        accountId: accountId,
        categoryId: categoryId,
        updatedBy: userId,
        latitude: input.latitude,
        longitude: input.longitude,
        geoAccuracy: input.geoAccuracy,
        shopName: input.shopName,
        shopMall: input.shopMall,
        additionalServiceChargePercent: input.additionalServiceChargePercent,
        isGstExcluded: input.isGstExcluded,
        isDeleted: input.isDeleted,
      })
      .onConflictDoUpdate({
        target: expensesTable.id,
        set: excludedAll(expensesTable, ['belongsToId']),
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
      eq(expensesTable.belongsToId, userId),
      gte(expensesTable.billedAt, filterStart),
      lt(expensesTable.billedAt, filterEnd),
      !showDeleted ? eq(expensesTable.isDeleted, false) : undefined,
    ];

    const expenseItemSubquery = db
      .select({
        itemOne: max(caseWhen(eq(expenseItemsTable.sequence, sql.raw('0')), expenseItemsTable.name)).as('itemOne'),
        itemTwo: max(caseWhen(eq(expenseItemsTable.sequence, sql.raw('1')), expenseItemsTable.name)).as('itemTwo'),
        count: count().as('count'),
        expenseId: expenseItemsTable.expenseId,
      })
      .from(expenseItemsTable)
      .where(eq(expenseItemsTable.isDeleted, false))
      .groupBy(expenseItemsTable.expenseId)
      .as('items');

    const expenses = await db
      .select({
        id: expensesTable.id,
        description: caseWhen(eq(expenseItemSubquery.count, sql.raw('1')), expenseItemSubquery.itemOne)
          .whenThen(
            eq(expenseItemSubquery.count, sql.raw('2')),
            concat(expenseItemSubquery.itemOne, sql.raw("' and '"), expenseItemSubquery.itemTwo),
          )
          .else(
            concat(
              expenseItemSubquery.itemOne,
              sql.raw("' and '"),
              sql`(${expenseItemSubquery.count} - 1)`,
              sql.raw("' items'"),
            ),
          ),
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
      .leftJoin(expenseItemSubquery, eq(expensesTable.id, expenseItemSubquery.expenseId))
      .where(and(...filterList))
      .orderBy(desc(expensesTable.billedAt));

    return {
      expenses,
    };
  });

const getSuggestionsProcedure = protectedProcedure
  .input(
    z
      .object({
        type: z.literal('shopName'),
        search: z.string().min(2),
      })
      .or(
        z.object({
          type: z.literal('shopMall'),
          search: z.string().min(2),
        }),
      )
      .or(
        z.object({
          type: z.literal('itemName'),
          search: z.string().min(2),
          shopName: z.string().nullish(),
        }),
      )
      .or(
        z.object({
          type: z.literal('refundSource'),
          search: z.string().min(2),
        }),
      ),
  )
  .mutation(async ({ input, ctx, signal }) => {
    const { db, userId } = ctx;
    const search = input.search.toUpperCase();
    const fuzzyPattern =
      '%' +
      search
        .replace(/(.)\1+/g, '$1')
        .split('')
        .join('%') +
      '%';
    const searchRanking = (column: AnyColumn) => sql<number>`CASE
      WHEN ${column} = ${search} THEN 0
      WHEN ${column} LIKE ${search + '%'} THEN 1
      WHEN ${column} LIKE ${'%' + search + '%'} THEN 2
      ELSE 3 END`;

    signal?.throwIfAborted();

    if (input.type === 'shopName') {
      const suggestions = await db
        .select({ value: sql<string>`${expensesTable.shopName}` })
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.belongsToId, userId),
            isNotNull(expensesTable.shopName),
            like(expensesTable.shopName, fuzzyPattern),
          ),
        )
        .groupBy(expensesTable.shopName)
        .orderBy(searchRanking(expensesTable.shopName), desc(count()))
        .limit(5);
      return {
        ...input,
        suggestions: suggestions.map(({ value }) => value),
      };
    } else if (input.type === 'shopMall') {
      const suggestions = await db
        .select({ value: sql<string>`${expensesTable.shopMall}` })
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.belongsToId, userId),
            isNotNull(expensesTable.shopMall),
            like(expensesTable.shopMall, fuzzyPattern),
          ),
        )
        .groupBy(expensesTable.shopMall)
        .orderBy(searchRanking(expensesTable.shopMall), desc(count()))
        .limit(5);
      return {
        ...input,
        suggestions: suggestions.map(({ value }) => value),
      };
    } else if (input.type === 'itemName') {
      const suggestions = await db
        .select({ value: sql<string>`${expenseItemsTable.name}` })
        .from(expenseItemsTable)
        .innerJoin(expensesTable, eq(expensesTable.id, expenseItemsTable.expenseId))
        .where(
          and(
            eq(expensesTable.belongsToId, userId),
            like(expenseItemsTable.name, fuzzyPattern),
            input.shopName ? eq(expensesTable.shopName, input.shopName.trim().toUpperCase()) : undefined,
          ),
        )
        .groupBy(expenseItemsTable.name)
        .orderBy(searchRanking(expenseItemsTable.name), desc(count()))
        .limit(5);
      return {
        ...input,
        suggestions: suggestions.map(({ value }) => value),
      };
    } else if (input.type === 'refundSource') {
      const suggestions = await db
        .select({ value: sql<string>`${expenseRefundsTable.source}` })
        .from(expenseRefundsTable)
        .innerJoin(expensesTable, eq(expensesTable.id, expenseRefundsTable.expenseId))
        .where(and(eq(expensesTable.belongsToId, userId), like(expenseRefundsTable.source, fuzzyPattern)))
        .groupBy(expenseRefundsTable.source)
        .orderBy(searchRanking(expenseRefundsTable.source), desc(count()))
        .limit(5);
      return {
        ...input,
        suggestions: suggestions.map(({ value }) => value),
      };
    } else {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED' });
    }
  });

const COORD_THRESHOLD = 0.0009; // ~100m

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
      const nearbyShopsColumns = {
        shopName: expensesTable.shopName,
        shopMall: expensesTable.shopMall,
        additionalServiceChargePercent: expensesTable.additionalServiceChargePercent,
        isGstExcluded: expensesTable.isGstExcluded,
        categoryId: expensesTable.categoryId,
        accountId: expensesTable.accountId,
      } as const;
      const nearbyShopsCondition = and(
        eq(expensesTable.belongsToId, userId),
        between(expensesTable.latitude, input.latitude - COORD_THRESHOLD, input.latitude + COORD_THRESHOLD),
        between(expensesTable.longitude, input.longitude - COORD_THRESHOLD, input.longitude + COORD_THRESHOLD),
        isNotNull(expensesTable.shopName),
      );

      const distance = sql<number>`(${expensesTable.latitude} - ${input.latitude}) * (${expensesTable.latitude} - ${input.latitude})
                    + (${expensesTable.longitude} - ${input.longitude}) * (${expensesTable.longitude} - ${input.longitude})`;

      if (itemNames.length === 0) {
        return await db
          .selectDistinct(nearbyShopsColumns)
          .from(expensesTable)
          .where(nearbyShopsCondition)
          .orderBy(distance, desc(expensesTable.billedAt))
          .limit(5);
      } else {
        const hasMatchingItems = sql<number>`MIN(CASE WHEN ${inArray(expenseItemsTable.name, itemNames)} THEN 0 ELSE 1 END)`;
        return await db
          .select(nearbyShopsColumns)
          .from(expensesTable)
          .leftJoin(expenseItemsTable, eq(expensesTable.id, expenseItemsTable.expenseId))
          .where(nearbyShopsCondition)
          .groupBy(...Object.values(nearbyShopsColumns))
          .orderBy(hasMatchingItems, distance, desc(expensesTable.billedAt))
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
        .where(
          and(eq(expensesTable.belongsToId, userId), eq(expensesTable.shopName, input.shopName.trim().toUpperCase())),
        )
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
          eq(expensesTable.belongsToId, userId),
          eq(expenseItemsTable.name, itemName),
          input.shopName ? eq(expensesTable.shopName, input.shopName.trim().toUpperCase()) : undefined,
        ),
      )
      .groupBy(expenseItemsTable.priceCents)
      .orderBy(desc(max(expensesTable.billedAt)), desc(count()))
      .limit(1);
  });

const deleteExpenseProcedure = protectedProcedure
  .input(z.object({ expenseId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;
    const { expenseId } = input;
    const result = await db
      .update(expensesTable)
      .set({ isDeleted: true })
      .where(and(eq(expensesTable.belongsToId, userId), eq(expensesTable.id, expenseId)));

    if (result.meta.rows_written == 0) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

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
  delete: deleteExpenseProcedure,
};
