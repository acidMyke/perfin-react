import { createDatabase, type AppDatabase } from '#server/lib/db';
import BatchCollector from '#server/lib/BatchCollector';
import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import {
  expenseAdjustmentsTable,
  expenseItemsTable,
  expensesTable,
  searchIndexGenerationsTable,
} from '../../db/schema';
import { and, eq, gt, inArray, SQL, sql } from 'drizzle-orm';
import { cleanupOldIndex, getLatestIndexGen, processReindexing } from '#server/features/expenses/indexCreation';

type BatchResultType = {
  hasMore: boolean;
  cursorId: string | undefined;
};

export class ExpenseReindexer extends WorkflowEntrypoint<Env, undefined> {
  private static limit = 60;
  async run(_event: WorkflowEvent<undefined>, step: WorkflowStep) {
    const generation = await step.do('get-generation', async () => {
      const db = createDatabase(this.env);
      const currentGen = await getLatestIndexGen(db);
      const nextGen = currentGen + 1;
      await db.insert(searchIndexGenerationsTable).values({ currentGen: nextGen });
      return nextGen;
    });

    let hasMore = true;
    let cursorId: string | undefined = undefined;

    while (hasMore) {
      const batchResult: BatchResultType = await step.do(`batch-${cursorId}`, async () => {
        const db = createDatabase(this.env);
        const expenses = await this.retrieveExpensesWithChilds(db, cursorId);
        if (expenses.length == 0) return { cursorId, hasMore: false };
        const collector = new BatchCollector();
        const counts = await processReindexing(collector, db, expenses, generation);
        collector.push(
          db
            .update(searchIndexGenerationsTable)
            .set({ recordsProcessed: sql`${searchIndexGenerationsTable.recordsProcessed} + ${expenses.length}` })
            .where(eq(searchIndexGenerationsTable.currentGen, generation)),
        );
        await collector.executeBatch(db);

        return {
          hasMore: expenses.length === ExpenseReindexer.limit,
          cursorId: expenses.length > 0 ? expenses[expenses.length - 1].id : undefined,
          counts,
        };
      });

      cursorId = batchResult.cursorId;
      hasMore = batchResult.hasMore;

      await step.sleep(`sleep-${cursorId}`, this.env.REINDEXER_SLEEP);
    }

    await step.do('cleanup-old-index', async () => {
      const db = createDatabase(this.env);
      await cleanupOldIndex(db, generation);
    });
  }

  private async retrieveExpensesWithChilds(db: AppDatabase, cursorId: string | undefined) {
    // Fetch expenses
    const cond: SQL[] = [];
    if (cursorId) cond.push(gt(expensesTable.id, cursorId));

    const rawExpenses = await db
      .select()
      .from(expensesTable)
      .where(and(...cond))
      .orderBy(expensesTable.id)
      .limit(ExpenseReindexer.limit);

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
