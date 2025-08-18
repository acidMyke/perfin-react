import { FormInputError, protectedProcedure } from '../trpc';
import * as schema from '../../db/schema';
import { and, asc, desc, eq, getTableColumns, gt, lt, or, SQL, type InferSelectModel } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { parseISO } from 'date-fns/parseISO';
import { alias, SQLiteSelectBuilder } from 'drizzle-orm/sqlite-core';

type Option = {
  name: string;
  id: string;
};

const loadCreateExpenseProcedure = protectedProcedure.query(async ({ ctx: { db, user } }) => {
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
      limit: z.number().min(1).max(100).default(50),
      cursor: z.number().nullish(),
      direction: z.enum(['forward', 'backward']).default('forward'),
    }),
  )
  .query(async ({ input, ctx }) => {
    const { db } = ctx;
    const userId = ctx.user.id;
    const { limit, cursor, direction } = input;
    const filterList: SQL<unknown>[] = [eq(schema.expensesTable.belongsToId, userId)];

    let subjectPr =
      typeof cursor !== 'undefined' && cursor !== null
        ? undefined
        : db
            .select({
              id: schema.subjectsTable.id,
              type: schema.subjectsTable.type,
              name: schema.subjectsTable.name,
              sequence: schema.subjectsTable.sequence,
              count: db.$count(
                schema.expensesTable,
                and(
                  eq(schema.expensesTable.belongsToId, userId),
                  or(
                    eq(schema.expensesTable.accountId, schema.subjectsTable.id),
                    eq(schema.expensesTable.categoryId, schema.subjectsTable.id),
                  ),
                ),
              ),
            })
            .from(schema.subjectsTable)
            .where(eq(schema.subjectsTable.belongsToId, userId));

    if (cursor) {
      const cursorCompareFn = direction == 'forward' ? gt : lt;
      filterList.push(cursorCompareFn(schema.expensesTable.billedAt, new Date(cursor)));
    }

    const accountSubject = alias(schema.subjectsTable, 'account');
    const categorySubject = alias(schema.subjectsTable, 'category');
    const expenses = await db
      .select({
        description: schema.expensesTable.description,
        amountCents: schema.expensesTable.amountCents,
        billedAt: schema.expensesTable.billedAt,
        account: accountSubject.name,
        category: categorySubject.name,
      })
      .from(schema.expensesTable)
      .leftJoin(
        accountSubject,
        and(eq(schema.expensesTable, accountSubject.id), eq(accountSubject.type, schema.SUBJECT_TYPE.ACCOUNT)),
      )
      .leftJoin(
        categorySubject,
        and(eq(schema.expensesTable, categorySubject.id), eq(categorySubject.type, schema.SUBJECT_TYPE.CATEGORY)),
      )
      .where(and(...filterList))
      .orderBy(desc(schema.expensesTable.billedAt))
      .limit(limit);

    return {
      expenses,
      subject: await subjectPr,
      nextCursor: expenses.at(-1)?.billedAt?.getTime(),
    };
  });

export const expenseProcedures = {
  loadCreate: loadCreateExpenseProcedure,
  create: createExpenseProcedure,
  list: listExpenseProcedure,
};
