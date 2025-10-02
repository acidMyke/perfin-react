import { FormInputError, protectedProcedure, type ProtectedContext } from '../trpc';
import { accountsTable, categoriesTable, expenseItemsTable, expensesTable, historiesTable } from '../../db/schema';
import { and, asc, desc, eq, getTableName, gte, isNotNull, like, lt, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { endOfMonth, parseISO } from 'date-fns';

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
        billedAt: true,
        accountId: true,
        categoryId: true,
        latitude: true,
        longitude: true,
        geoAccuracy: true,
        shopMall: true,
        shopName: true,
        version: true,
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
      amountCents: z.int().min(0, { error: 'Must be non-negative value' }),
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
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          priceCents: z.int().min(0, { error: 'Must be non-negative value' }),
          quantity: z.int().min(0, { error: 'Must be non-negative value' }),
          isDeleted: z.boolean().optional().default(false),
        }),
      ),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;

    const [accountId, categoryId] = await Promise.all([
      input.account ? safelyCreateSubject(ctx, accountsTable, input.account, 'accountId') : null,
      input.category ? safelyCreateSubject(ctx, categoriesTable, input.category, 'categoryId') : null,
    ]);

    const isCreate = input.expenseId === 'create';
    const values = {
      amountCents: input.amountCents,
      accountId: accountId,
      categoryId: categoryId,
      billedAt: input.billedAt,
      latitude: input.latitude,
      longitude: input.longitude,
      geoAccuracy: input.geoAccuracy,
      shopName: input.shopName,
      shopMall: input.shopMall,
    } satisfies Omit<typeof expensesTable.$inferInsert, 'belongsToId' | 'updatedBy'>;

    if (isCreate) {
      const insertReturns = await db
        .insert(expensesTable)
        .values({ ...values, belongsToId: userId, updatedBy: userId })
        .returning({ id: expensesTable.id });

      if (!insertReturns || insertReturns.length < 1) return;
      const expenseId = insertReturns[0].id;
      await db.batch([
        db.insert(expenseItemsTable).values(
          input.items.map(({ id, ...data }, sequence) => ({
            ...data,
            expenseId,
            sequence,
          })),
        ),
      ]);
    } else {
      const existing = await db.query.expensesTable.findFirst({
        where: and(eq(expensesTable.belongsToId, userId), eq(expensesTable.id, input.expenseId)),
        with: { items: true },
      });

      if (!existing || existing.isDeleted) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (existing.version > input.version) {
        throw new TRPCError({ code: 'CONFLICT' });
      }

      if (input.isDeleted) {
        await db
          .update(expensesTable)
          .set({ isDeleted: true })
          .where(and(eq(expensesTable.belongsToId, userId), eq(expensesTable.id, input.expenseId)));
        return;
      }

      const { id: rowId, version: versionWas, updatedAt: wasUpdatedAt, updatedBy: wasUpdatedBy } = existing;
      const valuesWere: Partial<typeof expensesTable.$inferInsert> = {};
      for (const key in values) {
        // @ts-ignore
        valuesWere[key] = existing[key];
      }

      // @ts-ignore
      valuesWere['items'] = existing.items;

      await db.batch([
        db
          .update(expensesTable)
          .set(values)
          .where(and(eq(expensesTable.belongsToId, userId), eq(expensesTable.id, input.expenseId))),
        db.insert(historiesTable).values({
          tableName: getTableName(expensesTable),
          rowId,
          valuesWere,
          versionWas,
          wasUpdatedAt,
          wasUpdatedBy,
        }),
        db
          .insert(expenseItemsTable)
          .values(
            input.items.map(({ id, ...data }, sequence) => ({
              ...data,
              id: id === 'create' ? undefined : id,
              expenseId: input.expenseId,
              sequence,
            })),
          )
          .onConflictDoUpdate({
            target: expenseItemsTable.id,
            set: {
              name: sql`excluded.name`,
              priceCents: sql`excluded.price_cents`,
              quantity: sql`excluded.quantity`,
              isDeleted: sql`excluded.is_deleted`,
            },
          }),
      ]);
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
      eq(expensesTable.belongsToId, userId),
      gte(expensesTable.billedAt, filterStart),
      lt(expensesTable.billedAt, filterEnd),
      !showDeleted ? eq(expensesTable.isDeleted, false) : undefined,
    ];

    const expenses = await db
      .select({
        id: expensesTable.id,
        // TODO: Set description
        description: sql<string>`" "`,
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
        }),
      ),
  )
  .mutation(async ({ input, ctx, signal }) => {
    const { db, userId } = ctx;
    const likelyValue = '%' + input.search.split('').join('%') + '%';
    signal?.throwIfAborted();

    if (input.type === 'shopName') {
      const suggestions = await db
        .selectDistinct({
          value: sql<string>`${expensesTable.shopName}`,
        })
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.belongsToId, userId),
            isNotNull(expensesTable.shopName),
            like(expensesTable.shopName, likelyValue),
          ),
        );
      return {
        ...input,
        suggestions: suggestions.map(({ value }) => value),
      };
    } else if (input.type === 'shopMall') {
      const suggestions = await db
        .selectDistinct({
          value: sql<string>`${expensesTable.shopMall}`,
        })
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.belongsToId, userId),
            isNotNull(expensesTable.shopMall),
            like(expensesTable.shopMall, likelyValue),
          ),
        );
      return {
        ...input,
        suggestions: suggestions.map(({ value }) => value),
      };
    } else if (input.type === 'itemName') {
      const suggestions = await db
        .selectDistinct({
          value: sql<string>`${expenseItemsTable.name}`,
        })
        .from(expenseItemsTable)
        .innerJoin(expensesTable, eq(expensesTable.id, expenseItemsTable.expenseId))
        .where(and(eq(expensesTable.belongsToId, userId), like(expenseItemsTable.name, likelyValue)));
      return {
        ...input,
        suggestions: suggestions.map(({ value }) => value),
      };
    } else {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED' });
    }
  });

export const expenseProcedures = {
  loadOptions: loadExpenseOptionsProcedure,
  loadDetail: loadExpenseDetailProcedure,
  save: saveExpenseProcedure,
  list: listExpenseProcedure,
  getSuggestions: getSuggestionsProcedure,
};
