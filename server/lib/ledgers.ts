import { and, eq, gt, inArray, isNull, lte, or, SQL } from 'drizzle-orm';
import { ledgersTable } from '../../db/schema';
import { type ProtectedContext } from '../trpc';
import {
  startOfYear,
  endOfYear,
  startOfQuarter,
  endOfQuarter,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

type DateRange = Pick<typeof ledgersTable.$inferSelect, 'dateFrom' | 'dateTo'>;

export function getLedgerRanges(date: Date): DateRange[] {
  return [
    { dateFrom: new Date(0), dateTo: null },
    { dateFrom: startOfYear(date), dateTo: endOfYear(date) },
    { dateFrom: startOfQuarter(date), dateTo: endOfQuarter(date) },
    { dateFrom: startOfMonth(date), dateTo: endOfMonth(date) },
    { dateFrom: startOfWeek(date), dateTo: endOfWeek(date) },
  ];
}

export type LedgerFilter = {
  subjects: (string | undefined | null)[];
  date: Date;
};

export async function touchLedgers(ctx: ProtectedContext, ...filters: LedgerFilter[]) {
  const { user, db } = ctx;
  const inserts: (typeof ledgersTable.$inferInsert)[] = [];
  const conditions: (SQL | undefined)[] = [];

  for (const filter of filters) {
    const ranges = getLedgerRanges(filter.date);
    const subjects = filter.subjects.filter(Boolean) as string[];

    inserts.push(
      ...[...subjects, null].flatMap(forSubjectId =>
        ranges.map(range => ({ ...range, forSubjectId, belongsToId: user.id, isDirty: true })),
      ),
    );

    conditions.push(
      and(
        lte(ledgersTable.dateFrom, filter.date),
        or(isNull(ledgersTable.dateTo), gt(ledgersTable.dateTo, filter.date)),
        or(isNull(ledgersTable.forSubjectId), inArray(ledgersTable.forSubjectId, subjects)),
      ),
    );
  }

  const insertedLedgers = await db.insert(ledgersTable).values(inserts).onConflictDoNothing().returning({
    id: ledgersTable.id,
  });

  const updatedLedgers = await db
    .update(ledgersTable)
    .set({ isDirty: true })
    .where(and(eq(ledgersTable.belongsToId, user.id), or(...conditions)))
    .returning({ id: ledgersTable.id });

  return {
    inserted: insertedLedgers.length,
    updated: updatedLedgers.length,
  };
}
