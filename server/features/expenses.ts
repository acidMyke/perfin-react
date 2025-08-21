import { FormInputError, protectedProcedure } from '../trpc';
import * as schema from '../../db/schema';
import { and, asc, desc, eq, gte, lt, or, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { parseISO } from 'date-fns/parseISO';
import { alias } from 'drizzle-orm/sqlite-core';
import { endOfMonth } from 'date-fns';

type Option = {
  name: string;
  id: string;
};

const loadExpenseOptionsProcedure = protectedProcedure.query(async ({ ctx: { db, user } }) => {
  const subjects = await db.query.subjectsTable.findMany({
    where: eq(schema.subjectsTable.belongsToId, user.id),
    orderBy: [asc(schema.subjectsTable.sequence), asc(schema.subjectsTable.createdAt)],
    columns: { name: true, id: true, type: true },
  });

  const accountOptions: Option[] = [];
  const categoryOptions: Option[] = [];

  for (const { type, ...option } of subjects) {
    if (type === schema.SUBJECT_TYPE.ACCOUNT) {
      accountOptions.push(option);
    } else if (type === schema.SUBJECT_TYPE.CATEGORY) {
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
    return db.query.expensesTable.findFirst({
      where: and(eq(schema.expensesTable.belongsToId, userId), eq(schema.expensesTable.id, input.expenseId)),
      columns: {
        description: true,
        amountCents: true,
        billedAt: true,
        accountId: true,
        categoryId: true,
      },
    });
  });

const createExpenseProcedure = protectedProcedure
  .input(
    z.object({
      description: z.string().nullish(),
      amountCents: z.int().min(0, { error: 'Must be non-negative value' }),
      billedAt: z.iso.datetime({ error: 'Invalid date time' }).transform(val => parseISO(val)),
      accountId: z.string().nullish(),
      categoryId: z.string().nullish(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;

    if (input.accountId || input.categoryId) {
      const foundIds = await db
        .select({ id: schema.subjectsTable.id, type: schema.subjectsTable.type })
        .from(schema.subjectsTable)
        .limit(2)
        .where(
          or(
            input.accountId
              ? and(
                  eq(schema.subjectsTable.id, input.accountId),
                  eq(schema.subjectsTable.type, schema.SUBJECT_TYPE.ACCOUNT),
                )
              : undefined,
            input.categoryId
              ? and(
                  eq(schema.subjectsTable.id, input.categoryId),
                  eq(schema.subjectsTable.type, schema.SUBJECT_TYPE.CATEGORY),
                )
              : undefined,
          ),
        );

      let hasAccountId = input.accountId == undefined;
      let hasCategoryId = input.categoryId == undefined;
      for (const { id, type } of foundIds) {
        if (input.accountId == id && type === 'account') {
          hasAccountId = true;
        }
        if (input.categoryId == id && type === 'category') {
          hasCategoryId = true;
        }
      }

      if (!hasAccountId || !hasCategoryId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          cause: new FormInputError({
            fieldErrors: {
              accountId: !hasAccountId ? ['Invalid account'] : undefined,
              categoryId: !hasCategoryId ? ['Invalid category'] : undefined,
            },
          }),
        });
      }
    }

    await db.insert(schema.expensesTable).values({
      description: input.description,
      amountCents: input.amountCents,
      accountId: input.accountId,
      categoryId: input.categoryId,
      billedAt: input.billedAt,
      belongsToId: userId,
    });
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
      eq(schema.expensesTable.belongsToId, userId),
      gte(schema.expensesTable.billedAt, filterStart),
      lt(schema.expensesTable.billedAt, filterEnd),
    ];

    const accountSubject = alias(schema.subjectsTable, 'account');
    const categorySubject = alias(schema.subjectsTable, 'category');
    const expenses = await db
      .select({
        id: schema.expensesTable.id,
        description: schema.expensesTable.description,
        amount: sql<number>`ROUND(${schema.expensesTable.amountCents} / CAST(100 AS REAL), 2)`,
        // amountCents: schema.expensesTable.amountCents,
        billedAt: schema.expensesTable.billedAt,
        account: {
          name: accountSubject.name,
        },
        category: {
          name: categorySubject.name,
        },
        createdAt: schema.expensesTable.createdAt,
      })
      .from(schema.expensesTable)
      .leftJoin(
        accountSubject,
        and(
          eq(schema.expensesTable.accountId, accountSubject.id),
          eq(accountSubject.type, schema.SUBJECT_TYPE.ACCOUNT),
        ),
      )
      .leftJoin(
        categorySubject,
        and(
          eq(schema.expensesTable.categoryId, categorySubject.id),
          eq(categorySubject.type, schema.SUBJECT_TYPE.CATEGORY),
        ),
      )
      .where(and(...filterList))
      .orderBy(desc(schema.expensesTable.billedAt));

    return {
      expenses,
    };
  });

export const expenseProcedures = {
  loadOptions: loadExpenseOptionsProcedure,
  loadDetail: loadExpenseDetailProcedure,
  create: createExpenseProcedure,
  list: listExpenseProcedure,
};
