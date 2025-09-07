import { and, eq, gte, lt, or, sum } from 'drizzle-orm';
import { expensesTable, ledgersTable } from '../../db/schema';
import { type AppDatabase, type ProtectedContext } from '../trpc';
import {
  startOfQuarter,
  endOfQuarter,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
} from 'date-fns';

type DateRange = Pick<typeof ledgersTable.$inferSelect, 'dateFrom' | 'dateTo'>;

export function getLedgerRanges(date: Date): DateRange[] {
  return [
    { dateFrom: startOfQuarter(date), dateTo: endOfQuarter(date) },
    { dateFrom: startOfMonth(date), dateTo: endOfMonth(date) },
    { dateFrom: startOfWeek(date), dateTo: endOfWeek(date) },
    { dateFrom: startOfDay(date), dateTo: endOfDay(date) },
  ];
}

export type LedgerFilter = {
  subjects: (string | undefined | null)[];
  date: Date;
};

export async function recomputeLedgers(ctx: ProtectedContext, ...filters: LedgerFilter[]) {
  const { user, db } = ctx;
  const promises: ReturnType<typeof recomputeLedger>[] = [];

  for (const filter of filters) {
    const ranges = getLedgerRanges(filter.date);
    const subjects = filter.subjects.filter(Boolean) as [string, string, null];
    subjects.push(null);

    for (const forSubjectId of subjects) {
      for (const { dateTo, dateFrom } of ranges) {
        promises.push(recomputeLedger(db, { belongsToId: user.id, dateTo, dateFrom, forSubjectId }));
      }
    }
  }

  return Promise.all(promises);
}

type LedgerCriteria = Pick<typeof ledgersTable.$inferSelect, 'dateFrom' | 'dateTo' | 'forSubjectId' | 'belongsToId'>;

async function recomputeLedger(db: AppDatabase, criteria: LedgerCriteria) {
  const { dateFrom, dateTo, forSubjectId, belongsToId } = criteria;
  if (dateTo == null) return;

  const [[{ expenses }]] = await Promise.all([
    /// expensesTable
    db
      .select({ expenses: sum(expensesTable.amountCents).mapWith(Number) })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.belongsToId, belongsToId),
          gte(expensesTable.billedAt, dateFrom),
          lt(expensesTable.billedAt, dateTo),
          forSubjectId
            ? or(eq(expensesTable.accountId, forSubjectId), eq(expensesTable.categoryId, forSubjectId))
            : undefined,
        ),
      ),
  ]);

  const totalCents = -expenses;

  await db
    .insert(ledgersTable)
    .values({ belongsToId, dateFrom, dateTo, forSubjectId, debitCents: expenses, creditCents: 0, totalCents })
    .onConflictDoUpdate({
      set: { debitCents: expenses, creditCents: 0, totalCents },
      target: [ledgersTable.belongsToId, ledgersTable.forSubjectId, ledgersTable.dateFrom, ledgersTable.dateTo],
    });

  return;
}
