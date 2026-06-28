import { createDatabase, type AppDatabase } from '#server/lib/db';
import BatchCollector from '#server/lib/BatchCollector';
import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import { expenseAdjustmentsTable, expenseItemsTable, expensesTable, searchIndexVersionTable } from '../../db/schema';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { cleanupOldIndex, processReindexing } from '#server/features/expenses/indexing';

export type UserExpenseReindexerParam = {
  userId: string;
  version: number;
};

type BatchResultType = {
  hasMore: boolean;
  cursorId: string | undefined;
};

export class UserExpenseReindexer extends WorkflowEntrypoint<Env, UserExpenseReindexerParam> {
  private static limit = 40;
  async run(event: WorkflowEvent<UserExpenseReindexerParam>, step: WorkflowStep) {
    const { payload } = event;
    const { userId, version } = payload;
    let hasMore = true;
    let cursorId: string | undefined = undefined;

    while (hasMore) {
      const batchResult: BatchResultType = await step.do(`batch-${cursorId}`, async () => {
        const db = createDatabase(this.env);
        const expenses = await this.retrieveExpensesWithChilds(db, userId, cursorId);
        if (expenses.length == 0) return { cursorId, hasMore: false };
        const collector = new BatchCollector();
        await processReindexing(collector, db, expenses, version);
        collector.push(
          db
            .update(searchIndexVersionTable)
            .set({ recordsProcessed: sql`${searchIndexVersionTable.recordsProcessed} + ${expenses.length}` })
            .where(and(eq(searchIndexVersionTable.userId, userId), eq(searchIndexVersionTable.version, version))),
        );
        await collector.executeBatch(db);

        return {
          hasMore: expenses.length === UserExpenseReindexer.limit,
          cursorId: expenses.length > 0 ? expenses[expenses.length - 1].id : undefined,
        };
      });

      cursorId = batchResult.cursorId;
      hasMore = batchResult.hasMore;

      await step.sleep(`sleep-${cursorId}`, this.env.REINDEXER_SLEEP);
    }

    await step.do('cleanup-old-index', async () => {
      const db = createDatabase(this.env);
      await cleanupOldIndex(db, userId, version);
    });
  }

  private async retrieveExpensesWithChilds(db: AppDatabase, userId: string, cursorId: string | undefined) {
    // Fetch expenses
    const cond = [eq(expensesTable.userId, userId)];
    if (cursorId) cond.push(gt(expensesTable.id, cursorId));

    const rawExpenses = await db
      .select()
      .from(expensesTable)
      .where(and(...cond))
      .orderBy(expensesTable.id)
      .limit(UserExpenseReindexer.limit);

    if (rawExpenses.length <= 0) {
      return [];
    }

    // Fetching child tables
    const expenseIds = rawExpenses.map(({ id }) => id);
    const [allItems, allAdjustments] = await db.batch([
      db
        .select({
          id: expenseItemsTable.id,
          name: expenseItemsTable.name,
          expenseId: expenseItemsTable.expenseId,
        })
        .from(expenseItemsTable)
        .where(and(inArray(expenseItemsTable.expenseId, expenseIds), eq(expenseItemsTable.isDeleted, false)))
        .orderBy(expenseItemsTable.expenseId, expenseItemsTable.sequence),
      db
        .select({
          id: expenseAdjustmentsTable.id,
          name: expenseAdjustmentsTable.name,
          expenseId: expenseAdjustmentsTable.expenseId,
        })
        .from(expenseAdjustmentsTable)
        .where(
          and(inArray(expenseAdjustmentsTable.expenseId, expenseIds), eq(expenseAdjustmentsTable.isDeleted, false)),
        )
        .orderBy(expenseAdjustmentsTable.expenseId, expenseAdjustmentsTable.sequence),
    ]);

    let [itemIdx, adjustmentsIdx] = [0, 0];
    const expenses = rawExpenses.map(expense => {
      const items: typeof allItems = [];
      const adjustments: typeof allAdjustments = [];

      while (itemIdx < allItems.length && allItems[itemIdx].expenseId === expense.id) {
        items.push(allItems[itemIdx]);
        itemIdx++;
      }

      while (adjustmentsIdx < allAdjustments.length && allAdjustments[adjustmentsIdx].expenseId === expense.id) {
        adjustments.push(allAdjustments[adjustmentsIdx]);
        adjustmentsIdx++;
      }

      return { ...expense, items, adjustments };
    });

    return expenses;
  }
}
