import { FormInputError, protectedProcedure } from '../trpc';
import { createExpenseValidator } from '../validators';
import * as schema from '../../db/schema';
import { and, eq, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

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
  create: createExpenseProcedure,
};
