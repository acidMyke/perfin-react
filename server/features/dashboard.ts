import { endOfToday, getUnixTime, subDays } from 'date-fns';
import { protectedProcedure } from '../trpc';
import { and, between, eq, sql } from 'drizzle-orm';
import { expensesTable } from '../../db/schema';

const getDashboardDataProcedure = protectedProcedure.query(async ({ ctx }) => {
  const { db, userId } = ctx;

  //  7days & 14 days segments
  const d = endOfToday();
  const dMinus7 = subDays(d, 7);
  const dMinus14 = subDays(d, 14);
  const dMinus28 = subDays(d, 28);

  const segmentResult = await db
    .select({
      rangeId: sql<number>`CASE
        WHEN ${expensesTable.billedAt} BETWEEN ${getUnixTime(dMinus7)} AND ${getUnixTime(d)} THEN 0
        WHEN ${expensesTable.billedAt} BETWEEN ${getUnixTime(dMinus14)} AND ${getUnixTime(dMinus7)} THEN 1
        WHEN ${expensesTable.billedAt} BETWEEN ${getUnixTime(dMinus28)} AND ${getUnixTime(dMinus14)} THEN 2
        ELSE NULL END AS rangeId`,
      expensesSum: sql<number>`ROUND(SUM(${expensesTable.amountCents}) / CAST(100 AS REAL), 2)`,
    })
    .from(expensesTable)
    .where(and(eq(expensesTable.belongsToId, userId), between(expensesTable.billedAt, dMinus28, d)))
    .groupBy(sql`rangeId`)
    .orderBy(sql`rangeId asc`);

  const amounts = [0, 0, 0];

  for (const { rangeId, expensesSum } of segmentResult) {
    amounts[rangeId] = expensesSum;
  }

  return {
    sevenDays: {
      current: amounts[0],
      prior: amounts[1],
    },
    fourteenDays: {
      current: amounts[0] + amounts[1],
      prior: amounts[2],
    },
    recentExpenses: [],
  };
});

export const dashboardProcedure = {
  getData: getDashboardDataProcedure,
};
