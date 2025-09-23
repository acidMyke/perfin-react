import { endOfToday, getUnixTime, sub, subDays } from 'date-fns';
import { protectedProcedure } from '../trpc';
import { and, between, eq, gt, sql } from 'drizzle-orm';
import { expensesTable } from '../../db/schema';
import z from 'zod';

const getInsightsProcedure = protectedProcedure.query(async ({ ctx }) => {
  const { db, userId } = ctx;

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

  const lastFourteenDays = amounts[0] + amounts[1];
  const diffSevenDays = amounts[0] - amounts[1];
  const diffFourteenDays = lastFourteenDays - amounts[2];

  return {
    lastSevenDays: amounts[0],
    diffSevenDays,
    percentSevenDays: amounts[1] === 0 ? 1 : diffSevenDays / amounts[1],
    lastFourteenDays,
    diffFourteenDays,
    percentFourteenDays: amounts[2] === 0 ? 1 : diffFourteenDays / amounts[2],
  };
});

const getTrendProcedure = protectedProcedure
  .input(
    z.object({
      interval: z.enum(['days', 'weeks', 'months']).default('days'),
    }),
  )
  .query(async ({ ctx, input }) => {
    const { interval } = input;
    const { db, userId } = ctx;
    const duration = interval == 'days' ? 28 : 14;

    const strf = {
      days: sql`%Y-%m-%d`,
      weeks: sql`%Y-%W`,
      months: sql`%Y-%m`,
    }[interval];

    const trendData = await db
      .select({
        tick: sql<string>`strftime('${strf}', datetime(${expensesTable.billedAt}, 'unixepoch', '-8 hours')) as label`,
        amount: sql<number>`ROUND(SUM(${expensesTable.amountCents}) / CAST(100 AS REAL), 2)`,
      })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.belongsToId, userId),
          gt(expensesTable.billedAt, sub(endOfToday(), { [interval]: duration })),
        ),
      )
      .groupBy(sql`label`)
      .orderBy(sql`label asc`);

    return {
      trendData,
      duration,
    };
  });

export const dashboardProcedure = {
  getInsights: getInsightsProcedure,
  getTrend: getTrendProcedure,
};
