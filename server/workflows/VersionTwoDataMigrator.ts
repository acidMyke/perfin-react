import { createDatabase, type AppDatabase } from '#server/lib/db';
import { getLocationBoxId } from '#server/lib/utils';
import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import { expenseAdjustmentsTable, expenseItemsTable, expenseRefundsTable, expensesTable } from 'db/schema';
import { eq, getColumns, gt, inArray } from 'drizzle-orm';

export type VersionTwoDataMigratorParam = {
  maxCount: number;
  maxCycle: number;
  maxDelay: number;
  after?: string;
};

export type CycleCheckpointEvent = {
  kill?: boolean;
};

export type ExecuteMigrationCycleParam = {
  env: Env;
  lastSeenId?: string;
  limit?: number;
};

async function executeMigrationCycle(params: ExecuteMigrationCycleParam) {
  const { env, lastSeenId, limit = 1 } = params;
  const db = createDatabase(env);
  try {
    const { expenseIds, expenses } = await retrieveExpensesWithChilds(db, lastSeenId, limit);

    const expenseUpdateSets = new Map<string, Omit<Partial<typeof expensesTable.$inferInsert>, 'expenseId'>>();
    const adjustmnetUpserts: Partial<typeof expenseAdjustmentsTable.$inferInsert>[] = [];
    type Searchable = { text: string; userId: string; sourceId: string; expenseId: string; context?: string };
    const searchables: Searchable[] = [];

    for (const expense of expenses) {
      const updateExpenseSet: Omit<Partial<typeof expensesTable.$inferInsert>, 'expenseId'> = {};
      let expenseUpdated = false;

      if (expense.shopMall) {
        searchables.push({
          expenseId: expense.id,
          sourceId: expense.id,
          text: expense.shopMall,
          userId: expense.userId,
        });
      }

      if (expense.shopName) {
        searchables.push({
          expenseId: expense.id,
          sourceId: expense.id,
          text: expense.shopName,
          userId: expense.userId,
          context: expense.shopMall ?? undefined,
        });
      }

      if (expense.latitude && expense.longitude) {
        const [newBoxId] = getLocationBoxId({ latitude: expense.latitude, longitude: expense.longitude });
        if (newBoxId !== expense.boxId) {
          updateExpenseSet.boxId = newBoxId;
          expenseUpdated ||= true;
        }
      }

      // TODO

      if (expenseUpdated) {
        expenseUpdateSets.set(expense.id, updateExpenseSet);
      }
    }

    return { isSuccess: true, expenseIds };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error;
      return { isSuccess: false, error: message };
    } else if (typeof error === 'string') {
      return { isSuccess: false, error };
    }
  }
}

async function retrieveExpensesWithChilds(db: AppDatabase, lastSeenId: string | undefined, limit: number) {
  // Fetch expenses
  const rawExpenses = await db
    .select()
    .from(expensesTable)
    .where(lastSeenId ? gt(expensesTable.id, lastSeenId) : undefined)
    .orderBy(expensesTable.id)
    .limit(limit);

  if (rawExpenses.length < 0) {
    throw 'No records found';
  }

  // Fetching child tables
  const expenseIds = rawExpenses.map(({ id }) => id);
  const [allItems, allRefunds, allAdjustments] = await db.batch([
    db
      .select()
      .from(expenseItemsTable)
      .where(inArray(expenseItemsTable.expenseId, expenseIds))
      .orderBy(expenseItemsTable.expenseId, expenseItemsTable.sequence),
    db
      .select()
      .from(expenseRefundsTable)
      .where(inArray(expenseRefundsTable.expenseId, expenseIds))
      .orderBy(expenseRefundsTable.expenseId, expenseRefundsTable.sequence),
    db
      .select()
      .from(expenseAdjustmentsTable)
      .where(inArray(expenseAdjustmentsTable.expenseId, expenseIds))
      .orderBy(expenseAdjustmentsTable.expenseId, expenseAdjustmentsTable.sequence),
  ]);

  let [itemIdx, refundIdx, adjustmentsIdx] = [0, 0, 0];
  const expenses = rawExpenses.map(expense => {
    const items: typeof allItems = [];
    const refunds: typeof allRefunds = [];
    const adjustments: typeof allAdjustments = [];

    while (itemIdx < allItems.length && allItems[itemIdx].expenseId === expense.id) {
      items.push(allItems[itemIdx]);
      itemIdx++;
    }

    while (refundIdx < allRefunds.length && allRefunds[refundIdx].expenseId === expense.id) {
      refunds.push(allRefunds[refundIdx]);
      refundIdx++;
    }

    while (adjustmentsIdx < allAdjustments.length && allAdjustments[adjustmentsIdx].expenseId === expense.id) {
      adjustments.push(allAdjustments[adjustmentsIdx]);
      adjustmentsIdx++;
    }

    return { ...expense, items, refunds, adjustments };
  });

  return { expenseIds, expenses };
}

export class VersionTwoDataMigrator extends WorkflowEntrypoint<Env, VersionTwoDataMigratorParam> {
  async run(event: WorkflowEvent<VersionTwoDataMigratorParam>, step: WorkflowStep) {
    const {
      payload: { maxCount, maxCycle, maxDelay, after },
      instanceId,
    } = event;

    await step.do('noti-start', async () => {
      this.logToDiscord(`Starting migration from ID: ${after}`, { maxCount, maxCycle, maxDelay, instanceId });
    });

    const cyclePerNoti = Math.ceil(maxCycle / 50);
    let lastSeenId = after;
    let curCycle = 0;
    let idProcSince: string[] = [];
    for (; curCycle < event.payload.maxCycle; curCycle++) {
      const migrationResult = await step.do(`migration-${lastSeenId}`, () =>
        executeMigrationCycle({ env: this.env, lastSeenId, limit: maxCount }),
      );

      const shouldNotify = cyclePerNoti <= 1 || curCycle % cyclePerNoti === 0;

      if (shouldNotify) {
        await step.do(`noti-batch-${curCycle}`, async () => {
          this.logToDiscord(`${instanceId} proccessed count: ${idProcSince.length}`, idProcSince);
        });
        idProcSince = [];
      }

      try {
        // Dual purpose: Delay & Kill switch
        const checkpointEvent = await step.waitForEvent<CycleCheckpointEvent>(`cycle-checkpoint-${curCycle}`, {
          type: 'cycle-checkpoint',
          timeout: maxDelay,
        });

        if (checkpointEvent.payload.kill) {
          console.warn('kill signal recieved');
          break;
        }
      } catch (e: unknown) {
        console.log(e);
      }
    }

    await step.do('noti-end', async () => {
      this.logToDiscord(`Finished ${curCycle}/${maxCycle}, Next after: ${lastSeenId}`, { instanceId });
    });
  }

  private async logToDiscord(message: string, data?: unknown): Promise<void> {
    const serializedData = data ? '```json\n' + JSON.stringify(data, null, 2) + '\n```' : '';
    const content = `${message}\n${serializedData}`;
    const response = await fetch(this.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to send Discord message: ${response.status} - ${text}`);
    }
  }
}
