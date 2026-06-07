import { BatchCollector, createDatabase, type AppDatabase } from '#server/lib/db';
import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import { expenseAdjustmentsTable, expenseItemsTable, expensesTable } from '../../db/schema';
import { and, eq, gt, inArray } from 'drizzle-orm';
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
        const expenses = await this.retrieveExpensesWithChilds(db, cursorId);
        const collector = new BatchCollector();
        processReindexing(collector, db, expenses, version);
        await collector.executeBatch(db, true);

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

  private async retrieveExpensesWithChilds(db: AppDatabase, cursorId: string | undefined) {
    // Fetch expenses
    const rawExpenses = await db
      .select()
      .from(expensesTable)
      .where(cursorId ? gt(expensesTable.id, cursorId) : undefined)
      .orderBy(expensesTable.id)
      .limit(UserExpenseReindexer.limit);

    if (rawExpenses.length <= 0) {
      throw 'No records found';
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
