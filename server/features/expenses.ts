import { FormInputError, protectedProcedure } from '../trpc';
import * as schema from '../../db/schema';
import { and, asc, desc, eq, getTableName, gte, lt, or, sql, SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { alias } from 'drizzle-orm/sqlite-core';
import { endOfMonth, parseISO } from 'date-fns';

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
    const expense = await db.query.expensesTable.findFirst({
      where: and(eq(schema.expensesTable.belongsToId, userId), eq(schema.expensesTable.id, input.expenseId)),
      columns: {
        description: true,
        amountCents: true,
        billedAt: true,
        accountId: true,
        categoryId: true,
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
      accountId: z
        .union([z.string(), z.object({ name: z.string() })])
        .nullish()
        .transform(v => v ?? null),
      categoryId: z
        .union([z.string(), z.object({ name: z.string() })])
        .nullish()
        .transform(v => v ?? null),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;
    let accountId: string | null = null;
    let categoryId: string | null = null;
    if (input.accountId || input.categoryId) {
      const foundIds = await db
        .select({ id: schema.subjectsTable.id, type: schema.subjectsTable.type })
        .from(schema.subjectsTable)
        .limit(2)
        .where(
          or(
            input.accountId
              ? and(
                  typeof input.accountId === 'string'
                    ? eq(schema.subjectsTable.id, input.accountId)
                    : eq(schema.subjectsTable.name, input.accountId.name),
                  eq(schema.subjectsTable.type, schema.SUBJECT_TYPE.ACCOUNT),
                )
              : undefined,
            input.categoryId
              ? and(
                  typeof input.categoryId === 'string'
                    ? eq(schema.subjectsTable.id, input.categoryId)
                    : eq(schema.subjectsTable.name, input.categoryId.name),
                  eq(schema.subjectsTable.type, schema.SUBJECT_TYPE.CATEGORY),
                )
              : undefined,
          ),
        );

      let accountError = typeof input.accountId === 'string' ? 'Invalid' : undefined;
      let categoryError = typeof input.categoryId === 'string' ? 'Invalid' : undefined;
      for (const { id, type } of foundIds) {
        if (type === schema.SUBJECT_TYPE.ACCOUNT) {
          if (input.accountId === id) {
            accountError = undefined;
            accountId = id;
          } else accountError = 'Duplicated';
        } else if (type === schema.SUBJECT_TYPE.CATEGORY) {
          if (input.categoryId === id) {
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
    const subjectsToInsert: (typeof schema.subjectsTable.$inferInsert)[] = [];
    if (input.accountId && typeof input.accountId === 'object') {
      subjectsToInsert.push({
        name: input.accountId.name,
        belongsToId: userId,
        type: schema.SUBJECT_TYPE.ACCOUNT,
      });
    }

    if (input.categoryId && typeof input.categoryId === 'object') {
      subjectsToInsert.push({
        name: input.categoryId.name,
        belongsToId: userId,
        type: schema.SUBJECT_TYPE.CATEGORY,
      });
    }

    if (subjectsToInsert.length > 0) {
      const insertedSubjects = await db
        .insert(schema.subjectsTable)
        .values(subjectsToInsert)
        .returning({ id: schema.subjectsTable.id, type: schema.subjectsTable.type });

      for (const newSubject of insertedSubjects) {
        if (newSubject.type === schema.SUBJECT_TYPE.ACCOUNT) accountId = newSubject.id;
        if (newSubject.type === schema.SUBJECT_TYPE.CATEGORY) categoryId = newSubject.id;
      }
    }

    const isCreate = input.expenseId === 'create';
    const values = {
      description: input.description,
      amountCents: input.amountCents,
      accountId: accountId,
      categoryId: categoryId,
      billedAt: input.billedAt,
    } satisfies Omit<typeof schema.expensesTable.$inferInsert, 'belongsToId' | 'updatedBy'>;

    if (isCreate) {
      await db.insert(schema.expensesTable).values({ ...values, belongsToId: userId, updatedBy: userId });
    } else {
      const existing = await db.query.expensesTable.findFirst({
        where: and(eq(schema.expensesTable.belongsToId, userId), eq(schema.expensesTable.id, input.expenseId)),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const { id: rowId, version: versionWas, updatedAt: wasUpdatedAt, updatedBy: wasUpdatedBy } = existing;
      const valuesWere: Partial<typeof schema.expensesTable.$inferInsert> = {};
      for (const key in values) {
        // @ts-ignore
        valuesWere[key] = existing[key];
      }

      await db.batch([
        db
          .update(schema.expensesTable)
          .set(values)
          .where(and(eq(schema.expensesTable.belongsToId, userId), eq(schema.expensesTable.id, input.expenseId))),
        db.insert(schema.historiesTable).values({
          tableName: getTableName(schema.expensesTable),
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
  save: saveExpenseProcedure,
  list: listExpenseProcedure,
};
