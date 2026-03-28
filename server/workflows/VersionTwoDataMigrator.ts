import { createDatabase, type AppDatabase } from '#server/lib/db';
import { calculateExpense, GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { getLocationBoxId } from '#server/lib/utils';
import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import { expenseAdjustmentsTable, expenseItemsTable, expenseRefundsTable, expensesTable, generateId } from 'db/schema';
import { gt, inArray } from 'drizzle-orm';

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

type Searchable = {
  text: string;
  userId: string;
  sourceId: string;
  expenseId: string;
  context?: string;
};

type AdjustmentUpsert = typeof expenseAdjustmentsTable.$inferInsert & { id: string };

async function executeMigrationCycle(params: ExecuteMigrationCycleParam) {
  const { env, limit = 1 } = params;
  const db = createDatabase(env);
  let lastSeenId = params.lastSeenId;
  let processedCount = 0;
  try {
    const expenses = await retrieveExpensesWithChilds(db, lastSeenId, limit);

    const expenseUpdateSets = new Map<string, Omit<Partial<typeof expensesTable.$inferInsert>, 'expenseId'>>();
    const adjustmentUpserts: AdjustmentUpsert[] = [];
    const searchables: Searchable[] = [];
    try {
      for (const expense of expenses) {
        const { latitude, longitude } = expense;
        const updateExpenseSet: Omit<Partial<typeof expensesTable.$inferInsert>, 'expenseId'> = {};
        let expenseUpdated = false;

        const shopAndItemsSearchables = buildShopAndItemsSearchables(expense);

        if (latitude && longitude) {
          const [newBoxId] = getLocationBoxId({ latitude, longitude });
          if (newBoxId !== expense.boxId) {
            updateExpenseSet.boxId = newBoxId;
            expenseUpdated ||= true;
          }
        }

        const adjustmentResult = buildAdjustments(expense);
        validateMigratedData(expense, adjustmentResult.adjustmentUpserts);

        lastSeenId = expense.id;
        processedCount++;
        if (expenseUpdated) expenseUpdateSets.set(expense.id, updateExpenseSet);
        searchables.push(...shopAndItemsSearchables);
        adjustmentUpserts.push(...adjustmentResult.adjustmentUpserts);
        searchables.push(...adjustmentResult.searchables);
      }
    } catch (e) {
      // Partially / none processed
      if (processedCount === 0) {
        // none processed
        throw e;
      }
    }

    // Partially / Fully processed
    // TODO:

    return { isSuccess: true, lastSeenId, processedCount };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error;
      return { isSuccess: false, error: message };
    } else if (typeof error === 'string') {
      return { isSuccess: false, error };
    }
    return { isSuccess: false, error: 'Unknown error' };
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

  return expenses;
}

type ExpenseWithChild = Awaited<ReturnType<typeof retrieveExpensesWithChilds>>[number];

function buildShopAndItemsSearchables(expense: ExpenseWithChild) {
  const { id: expenseId, shopMall, shopName, items, userId } = expense;
  const searchables: Searchable[] = [];

  if (shopMall) {
    searchables.push({ expenseId, text: shopMall, sourceId: expenseId, userId });
  }

  if (shopName) {
    searchables.push({ expenseId, text: shopName, sourceId: expenseId, userId, context: shopMall ?? undefined });
  }

  for (const { id: sourceId, name, isDeleted } of items) {
    if (isDeleted) continue;
    searchables.push({ expenseId, text: name, sourceId, userId, context: shopName ?? undefined });
  }

  return searchables;
}

function buildAdjustments(expense: ExpenseWithChild) {
  const { id: expenseId, adjustments, additionalServiceChargePercent, isGstExcluded, refunds } = expense;
  const adjustmentUpserts: AdjustmentUpsert[] = [];

  let adjSeq = 0;
  let serviceChargeAdjustmentExist = false;
  let gstAdjustmentExist = false;
  const existingAdjIds = new Set<string>();
  for (const adjustment of adjustments) {
    existingAdjIds.add(adjustment.id);
    adjSeq++;
    serviceChargeAdjustmentExist ||= adjustment.name === SERVICE_CHARGE_NAME;
    gstAdjustmentExist ||= adjustment.name === GST_NAME;
  }

  if (additionalServiceChargePercent && additionalServiceChargePercent > 0 && !serviceChargeAdjustmentExist) {
    adjustmentUpserts.push({
      id: generateId(),
      name: SERVICE_CHARGE_NAME,
      rateBps: additionalServiceChargePercent * 100,
      amountCents: 0,
      expenseId,
      sequence: adjSeq++,
    });
  }

  if (isGstExcluded && !gstAdjustmentExist) {
    adjustmentUpserts.push({
      id: generateId(),
      name: GST_NAME,
      rateBps: 9_00,
      amountCents: 0,
      expenseId,
      sequence: adjSeq++,
    });
  }

  const searchables: Searchable[] = [];

  for (const refund of refunds) {
    if (existingAdjIds.has(refund.id)) continue;
    adjustmentUpserts.push({
      id: refund.id,
      name: refund.source,
      amountCents: refund.actualAmountCents ?? 0,
      expenseId,
      isDeleted: refund.isDeleted,
      version: refund.version,
      sequence: adjSeq++,
      expenseItemId: refund.expenseItemId,
    });
    searchables.push({
      expenseId,
      sourceId: refund.id,
      text: refund.source,
      userId: expense.userId,
      context: expense.shopMall ?? undefined,
    });
  }

  return { adjustmentUpserts, searchables };
}

function validateMigratedData(expense: ExpenseWithChild, adjustmentUpserts: AdjustmentUpsert[]) {
  // Newly calculated expense should match the pre-calculated value
  const newCalculatedResult = calculateExpense({
    ...expense,
    adjustments: [...expense.adjustments, ...adjustmentUpserts],
  });

  if (newCalculatedResult.netTotalCents !== expense.amountCents) {
    throw `mismatched calculated output new (${newCalculatedResult.netTotalCents}) !== existing (${expense.amountCents})`;
  }
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
