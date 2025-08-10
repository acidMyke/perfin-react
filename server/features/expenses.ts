import { protectedProcedure } from '../trpc';
import { createExpenseValidator } from '../validators';
import * as schema from '../../db/schema';

const createExpenseProcedure = protectedProcedure.input(createExpenseValidator).mutation(async ({ input, ctx }) => {
  const { user, db } = ctx;
  const userId = user.id;

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
