import { FormInputError, protectedProcedure } from '../trpc';
import { expensesTable, historiesTable, subjectsTable } from '../../db/schema';
import { and, asc, desc, eq, getTableName, gte, isNotNull, like, lt, or, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { alias } from 'drizzle-orm/sqlite-core';
import { endOfMonth, parseISO } from 'date-fns';
import { SubjectTypeConst } from '../../db/enum';

type Option = {
  label: string;
  value: string;
};

const loadExpenseOptionsProcedure = protectedProcedure.query(async ({ ctx: { db, user } }) => {
  const subjects = await db
    .select({ value: subjectsTable.id, label: subjectsTable.name, type: subjectsTable.type })
    .from(subjectsTable)
    .where(eq(subjectsTable.belongsToId, user.id))
    .orderBy(asc(subjectsTable.sequence), asc(subjectsTable.createdAt));

  const accountOptions: Option[] = [];
  const categoryOptions: Option[] = [];

  for (const { type, ...option } of subjects) {
    if (type === SubjectTypeConst.ACCOUNT) {
      accountOptions.push(option);
    } else if (type === SubjectTypeConst.CATEGORY) {
      categoryOptions.push(option);
    }
  }

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
        description: true,
        amountCents: true,
        billedAt: true,
        accountId: true,
        categoryId: true,
        latitude: true,
        longitude: true,
        geoAccuracy: true,
        shopMall: true,
        shopName: true,
      },
    });

    if (!expense) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return expense;
  });

const saveExpenseProcedure = protectedProcedure
  .input(
    z.object({
      expenseId: z.string(),
      description: z
        .string()
        .nullish()
        .transform(v => v ?? null),
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
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;
    let accountId: string | null = null;
    let categoryId: string | null = null;
    if (input.account || input.category) {
      const isSelectExistingAccount = input.account?.value !== 'create';
      const isSelectExistingCategory = input.category?.value !== 'create';

      const foundIds = await db
        .select({ id: subjectsTable.id, type: subjectsTable.type })
        .from(subjectsTable)
        .limit(2)
        .where(
          or(
            input.account
              ? and(
                  isSelectExistingAccount
                    ? eq(subjectsTable.id, input.account.value)
                    : eq(subjectsTable.name, input.account.label),
                  eq(subjectsTable.type, SubjectTypeConst.ACCOUNT),
                  eq(subjectsTable.belongsToId, userId),
                )
              : undefined,
            input.category
              ? and(
                  isSelectExistingCategory
                    ? eq(subjectsTable.id, input.category.value)
                    : eq(subjectsTable.name, input.category.label),
                  eq(subjectsTable.type, SubjectTypeConst.CATEGORY),
                  eq(subjectsTable.belongsToId, userId),
                )
              : undefined,
          ),
        );

      let accountError = isSelectExistingAccount ? 'Invalid' : undefined;
      let categoryError = isSelectExistingCategory ? 'Invalid' : undefined;
      for (const { id, type } of foundIds) {
        if (type === SubjectTypeConst.ACCOUNT && input.account) {
          if (input.account.value === id) {
            accountError = undefined;
            accountId = id;
          } else accountError = 'Duplicated';
        } else if (type === SubjectTypeConst.CATEGORY && input.category) {
          if (input.category.value === id) {
            categoryError = undefined;
            categoryId = id;
          } else categoryError = 'Duplicated';
        }
      }

      if (accountError || categoryError) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          cause: new FormInputError({
            fieldErrors: {
              accountId: accountError ? [accountError + '  Account'] : undefined,
              categoryId: categoryError ? [categoryError + '  Category'] : undefined,
            },
          }),
        });
      }
    }
    const subjectsToInsert: (typeof subjectsTable.$inferInsert)[] = [];
    if (input.account?.value === 'create') {
      subjectsToInsert.push({
        name: input.account.label,
        belongsToId: userId,
        type: SubjectTypeConst.ACCOUNT,
      });
    }

    if (input.category?.value === 'create') {
      subjectsToInsert.push({
        name: input.category.label,
        belongsToId: userId,
        type: SubjectTypeConst.CATEGORY,
      });
    }

    if (subjectsToInsert.length > 0) {
      const insertedSubjects = await db
        .insert(subjectsTable)
        .values(subjectsToInsert)
        .returning({ id: subjectsTable.id, type: subjectsTable.type });

      for (const newSubject of insertedSubjects) {
        if (newSubject.type === SubjectTypeConst.ACCOUNT) accountId = newSubject.id;
        if (newSubject.type === SubjectTypeConst.CATEGORY) categoryId = newSubject.id;
      }
    }

    const isCreate = input.expenseId === 'create';
    const values = {
      description: input.description,
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
      await db.insert(expensesTable).values({ ...values, belongsToId: userId, updatedBy: userId });
    } else {
      const existing = await db.query.expensesTable.findFirst({
        where: and(eq(expensesTable.belongsToId, userId), eq(expensesTable.id, input.expenseId)),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const { id: rowId, version: versionWas, updatedAt: wasUpdatedAt, updatedBy: wasUpdatedBy } = existing;
      const valuesWere: Partial<typeof expensesTable.$inferInsert> = {};
      for (const key in values) {
        // @ts-ignore
        valuesWere[key] = existing[key];
      }

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
      ]);
    }
  });

const listExpenseProcedure = protectedProcedure
  .input(
    z.object({
      month: z.number().min(0).max(11),
      year: z.number().min(2020),
    }),
  )
  .query(async ({ input, ctx }) => {
    const { db } = ctx;
    const userId = ctx.user.id;
    const { year, month } = input;
    const filterStart = new Date(year, month, 1, 0, 0, 0);
    const filterEnd = endOfMonth(filterStart);

    const filterList: SQL[] = [
      eq(expensesTable.belongsToId, userId),
      gte(expensesTable.billedAt, filterStart),
      lt(expensesTable.billedAt, filterEnd),
    ];

    const accountSubject = alias(subjectsTable, 'account');
    const categorySubject = alias(subjectsTable, 'category');
    const expenses = await db
      .select({
        id: expensesTable.id,
        description: expensesTable.description,
        amount: sql<number>`ROUND(${expensesTable.amountCents} / CAST(100 AS REAL), 2)`,
        // amountCents: expensesTable.amountCents,
        billedAt: expensesTable.billedAt,
        account: {
          name: accountSubject.name,
        },
        category: {
          name: categorySubject.name,
        },
        createdAt: expensesTable.createdAt,
      })
      .from(expensesTable)
      .leftJoin(
        accountSubject,
        and(eq(expensesTable.accountId, accountSubject.id), eq(accountSubject.type, SubjectTypeConst.ACCOUNT)),
      )
      .leftJoin(
        categorySubject,
        and(eq(expensesTable.categoryId, categorySubject.id), eq(categorySubject.type, SubjectTypeConst.CATEGORY)),
      )
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
          shopName: z.string().optional(),
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
        suggestions: suggestions.map(({ value }) => ({ label: value, value })),
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
        suggestions: suggestions.map(({ value }) => ({ label: value, value })),
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
