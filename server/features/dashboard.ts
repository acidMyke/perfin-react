import { endOfToday, sub, subDays } from 'date-fns';
import { protectedProcedure } from '../lib/trpc';
import { and, between, count, eq, gt, sql } from 'drizzle-orm';
import { expensesTable } from '../../db/schema';
import z from 'zod';
import { caseWhen } from '../lib/db';

const getInsightsProcedure = protectedProcedure.query(async ({ ctx }) => {
  const { db, userId } = ctx;

  const d = endOfToday();
  const dMinus7 = subDays(d, 7);
  const dMinus14 = subDays(d, 14);
  const dMinus28 = subDays(d, 28);

  const segmentResult = await db
    .select({
      rangeId: caseWhen(between(expensesTable.billedAt, dMinus7, d), 0)
        .whenThen(between(expensesTable.billedAt, dMinus14, dMinus7), 1)
        .whenThen(between(expensesTable.billedAt, dMinus28, dMinus14), 2)
        .elseNull()
        .as('rangeId'),
      expensesSum: sql<number>`ROUND(SUM(${expensesTable.amountCents}) / CAST(100 AS REAL), 2)`,
      expensesCount: count(),
    })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.userId, userId),
        between(expensesTable.billedAt, dMinus28, d),
        eq(expensesTable.isDeleted, false),
      ),
    )
    .groupBy(sql`rangeId`)
    .orderBy(sql`rangeId asc`);

  const sums = [0, 0, 0];
  const counts = [0, 0, 0];

  for (const { rangeId, expensesSum, expensesCount } of segmentResult) {
    sums[rangeId] = expensesSum;
    counts[rangeId] = expensesCount;
  }

  const [current7Sum, previous7Sum, previous14Sum] = sums;
  const [current7Count, previous7Count, previous14Count] = counts;

  const current14Sum = current7Sum + previous7Sum;
  const diff7 = current7Sum - previous7Sum;
  const diff14 = current14Sum - previous14Sum;

  const current14Count = current7Count + previous7Count;

  return {
    sevenDays: {
      current: {
        sum: current7Sum,
        count: current7Count,
      },
      previous: {
        sum: previous7Sum,
        count: previous7Count,
      },
      diff: diff7,
      percentChange: previous7Sum === 0 ? 1 : diff7 / previous7Sum,
    },

    fourteenDays: {
      current: {
        sum: current14Sum,
        count: current14Count,
      },
      previous: {
        sum: previous14Sum,
        count: previous14Count,
      },
      diff: diff14,
      percentChange: previous14Sum === 0 ? 1 : diff14 / previous14Sum,
    },

    totalCount: current14Count + previous14Count,
    totalSum: current14Sum + previous14Sum,
  };
});

const getTrendProcedure = protectedProcedure
  .input(
    z.object({
      interval: z.enum(['days', 'weeks', 'months']),
      duration: z.number().positive(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const { interval, duration } = input;
    const { db, userId } = ctx;

    const strf = {
      days: sql`%Y-%m-%d`,
      weeks: sql`%Y-%W`,
      months: sql`%Y-%m`,
    }[interval];

    const trendData = await db
      .select({
        tick: sql<string>`strftime('${strf}', datetime(${expensesTable.billedAt}, 'unixepoch', '+8 hours')) as label`,
        amount: sql<number>`ROUND(SUM(${expensesTable.amountCents}) / CAST(100 AS REAL), 2)`,
      })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.userId, userId),
          eq(expensesTable.isDeleted, false),
          gt(expensesTable.billedAt, sub(endOfToday(), { [interval]: duration })),
        ),
      )
      .groupBy(sql`label`)
      .orderBy(sql`label asc`);

    return { trendData };
  });

export const dashboardProcedure = {
  getInsights: getInsightsProcedure,
  getTrend: getTrendProcedure,
};
