import { and, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { ledgersTable, type expensesTable } from '../../db/schema';
import { type ProtectedContext } from '../trpc';

export type ExpenseForLedgerUpdate = Pick<
  typeof expensesTable.$inferSelect,
  'accountId' | 'categoryId' | 'amountCents' | 'billedAt'
>;

export async function updateLedgerOnExpense(ctx: ProtectedContext, expense: ExpenseForLedgerUpdate) {
  const { user, db } = ctx;
  const { accountId, categoryId, amountCents, billedAt } = expense;
  const subjects = [accountId, categoryId].filter(Boolean) as string[];

  // Get all related ledger
  const ledgers = await db.query.ledgersTable.findMany({
    columns: { id: true, totalCents: true, debitCents: true },
    where: and(
      eq(ledgersTable.belongsToId, user.id),
      gte(ledgersTable.dateFrom, billedAt),
      or(lt(ledgersTable.dateTo, billedAt), isNull(ledgersTable.dateTo)),
      or(inArray(ledgersTable.forSubjectId, subjects), isNull(ledgersTable.forSubjectId)),
    ),
  });

  if (ledgers.length == 0) {
    console.info('No ledger found for ', { accountId, categoryId, billedAt });
    return;
  }

  await db.batch(
    // @ts-expect-error
    ledgers.map(ledger =>
      db
        .update(ledgersTable)
        .set({
          totalCents: ledger.totalCents - amountCents,
          debitCents: ledger.debitCents + amountCents,
          shouldRecon: true,
        })
        .where(eq(ledgersTable.id, ledger.id)),
    ),
  );
}
