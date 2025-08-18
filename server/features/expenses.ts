import { FormInputError, protectedProcedure } from '../trpc';
import { createExpenseValidator } from '../validators';
import * as schema from '../../db/schema';
import { and, asc, eq, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

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

const createExpenseProcedure = protectedProcedure.input(createExpenseValidator).mutation(async ({ input, ctx }) => {
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

export const expenseProcedures = {
  loadCreate: loadCreateExpenseProcedure,
  create: createExpenseProcedure,
};
