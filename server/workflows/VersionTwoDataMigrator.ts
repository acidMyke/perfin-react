import { createDatabase, excludedAll, type AppDatabase } from '#server/lib/db';
import { blacklistSearchableText, calculateExpense, GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { getLocationBoxId, getMultiUserTextsHashes, getTrigrams, splitArray } from '#server/lib/utils';
import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import {
  expenseAdjustmentsTable,
  expenseItemsTable,
  expenseRefundsTable,
  expensesTable,
  expenseTextsTable,
  generateId,
  textChunksTable,
  textsContextsTable,
  textsTable,
} from '../../db/schema';
import { eq, gt, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import z from 'zod';

export const VersionTwoDataMigratorParamSchema = z.strictObject({
  maxCount: z.number(),
  maxCycle: z.number(),
  maxDelay: z.number(),
  lastSeenId: z.string().optional(),
});

export type VersionTwoDataMigratorParam = z.infer<typeof VersionTwoDataMigratorParamSchema>;

export const CHECKPOINT_EVENT_TYPE = 'cycle-checkpoint' as const;
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
  const procIds: string[] = [];
  let partialProcessedError: string | undefined;
  let currentProcessingId: string | undefined;
  try {
    const expenses = await retrieveExpensesWithChilds(db, lastSeenId, limit);
    const expenseUpdateSets = new Map<string, Omit<Partial<typeof expensesTable.$inferInsert>, 'expenseId'>>();
    const adjustmentUpserts: AdjustmentUpsert[] = [];
    const searchables: Searchable[] = [];
    try {
      for (const expense of expenses) {
        const { latitude, longitude } = expense;
        currentProcessingId = expense.id;
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
        procIds.push(expense.id);
        if (expenseUpdated) expenseUpdateSets.set(expense.id, updateExpenseSet);
        adjustmentUpserts.push(...adjustmentResult.adjustmentUpserts);
        searchables.push(...shopAndItemsSearchables, ...adjustmentResult.searchables);
      }
    } catch (error) {
      // Partially / none processed
      if (processedCount === 0) {
        // none processed
        throw error;
      }

      partialProcessedError =
        error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
    }

    // Partially / Fully processed
    const searchableRecords = await processSearchables(searchables, db);
    await saveMigratedChanges({ db, ...searchableRecords, expenseUpdateSets, adjustmentUpserts });

    return {
      isSuccess: true,
      lastSeenId,
      processedCount,
      procIds,
      partialProcessedError,
      currentProcessingId,
    } as const;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const { message } = error;
      return { isSuccess: false, error: message } as const;
    } else if (typeof error === 'string') {
      return { isSuccess: false, error } as const;
    }
    return { isSuccess: false, error: 'Unknown error' } as const;
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
      amountCents: -(refund.actualAmountCents ?? 0),
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
    adjustments: [...expense.adjustments, ...adjustmentUpserts].toSorted((a, b) => a.sequence - b.sequence),
  });

  if (newCalculatedResult.netTotalCents !== expense.amountCents) {
    throw `mismatched calculated output new (${newCalculatedResult.netTotalCents}) !== existing (${expense.amountCents})`;
  }
}

async function processSearchables(searchables: Searchable[], db: AppDatabase) {
  const searchableHashes = await getMultiUserTextsHashes(searchables);

  const existenceResult = await db.batch(
    // @ts-ignore
    splitArray(Array.from(searchableHashes.getAllHash()), 70).map(hashes =>
      db.select({ hash: textsTable.textHash }).from(textsTable).where(inArray(textsTable.textHash, hashes)),
    ),
  );

  const existingHashSet = new Set(
    (existenceResult as unknown as { hash: number }[][]).flatMap(x => x.map(({ hash }) => hash)),
  );

  const textsUpserts: (typeof textsTable.$inferInsert)[] = [];
  const textChunkUpserts: (typeof textChunksTable.$inferInsert)[] = [];
  const expenseTextsUpserts: (typeof expenseTextsTable.$inferInsert)[] = [];
  const textsContextsUpserts: (typeof textsContextsTable.$inferInsert)[] = [];

  for (const { userId, expenseId, text, sourceId, context } of searchables) {
    if (blacklistSearchableText.has(text)) continue;
    const textHash = searchableHashes.getHash(userId, text)!;
    if (!existingHashSet.has(textHash)) {
      textsUpserts.push({ textHash, userId, text });
      textChunkUpserts.push(...getTrigrams(text).map(chunk => ({ userId, chunk, textHash })));
    }
    if (context) {
      const ctxTextHash = searchableHashes.getHash(userId, context);
      if (ctxTextHash) {
        textsContextsUpserts.push({ textHash, ctxTextHash });
      }
    }
    expenseTextsUpserts.push({ textHash, sourceId, expenseId });
  }

  return { textsUpserts, textChunkUpserts, expenseTextsUpserts, textsContextsUpserts };
}

type SaveMigratedChangesParams = Awaited<ReturnType<typeof processSearchables>> & {
  expenseUpdateSets: Map<string, Omit<Partial<typeof expensesTable.$inferInsert>, 'expenseId'>>;
  adjustmentUpserts: AdjustmentUpsert[];
  db: AppDatabase;
};

async function saveMigratedChanges(params: SaveMigratedChangesParams) {
  const db = params.db;

  const batchItems: BatchItem<'sqlite'>[] = [];

  for (const [expenseId, setData] of params.expenseUpdateSets.entries()) {
    batchItems.push(db.update(expensesTable).set(setData).where(eq(expensesTable.id, expenseId)));
  }

  const adjBatches = splitArray(params.adjustmentUpserts, 9);
  const textsUpsertsBatches = splitArray(params.textsUpserts, 30);
  const textChunkUpsertsBatches = splitArray(params.textChunkUpserts, 30);
  const expenseTextsUpsertsBatches = splitArray(params.expenseTextsUpserts, 30);
  const textsContextsUpsertsBatches = splitArray(params.textsContextsUpserts, 30);

  batchItems.push(
    ...adjBatches.map(values =>
      db
        .insert(expenseAdjustmentsTable)
        .values(values)
        .onConflictDoUpdate({ target: expenseAdjustmentsTable.id, set: excludedAll(expenseAdjustmentsTable) }),
    ),
    ...textsUpsertsBatches.map(values => db.insert(textsTable).values(values).onConflictDoNothing()),
    ...textChunkUpsertsBatches.map(values => db.insert(textChunksTable).values(values).onConflictDoNothing()),
    ...expenseTextsUpsertsBatches.map(values => db.insert(expenseTextsTable).values(values).onConflictDoNothing()),
    ...textsContextsUpsertsBatches.map(values => db.insert(textsContextsTable).values(values).onConflictDoNothing()),
  );

  if (batchItems.length > 0) {
    // @ts-ignore
    await db.batch(batchItems);
  }
}

export class VersionTwoDataMigrator extends WorkflowEntrypoint<Env, VersionTwoDataMigratorParam> {
  async run(event: WorkflowEvent<VersionTwoDataMigratorParam>, step: WorkflowStep) {
    const {
      payload: { maxCount, maxCycle, maxDelay },
      instanceId,
    } = event;
    let lastSeenId = event.payload.lastSeenId;

    await step.do('noti-start', () =>
      this.logToDiscord(`Starting migration`, { lastSeenId, maxCount, maxCycle, maxDelay, instanceId }),
    );

    const cyclePerNoti = Math.ceil(maxCycle / 50);
    let curCycle = 0;
    let idProcSince: string[] = [];
    for (; curCycle < event.payload.maxCycle; curCycle++) {
      const migrationResult = await step.do(`migration-${lastSeenId}`, () =>
        executeMigrationCycle({ env: this.env, lastSeenId, limit: maxCount }),
      );

      if (!migrationResult.isSuccess) {
        await step.do(`noti-fail-${lastSeenId}-${curCycle}`, async () =>
          this.logToDiscord(`migration at cycle ${curCycle} failed: ${migrationResult.error}`, {
            ...migrationResult,
            lastSeenId,
            curCycle,
          }),
        );

        break;
      }

      lastSeenId = migrationResult.lastSeenId;
      idProcSince.push(...migrationResult.procIds);
      const shouldNotify = cyclePerNoti <= 1 || curCycle % cyclePerNoti === 0;

      if (shouldNotify) {
        await step.do(`noti-batch-${curCycle}`, () =>
          this.logToDiscord(`migration at cycle ${curCycle} processed`, { idProcSince, lastSeenId }),
        );
        idProcSince = [];
      }

      if (migrationResult.partialProcessedError) {
        await step.do(`noti-partial-processed-${curCycle}`, () =>
          this.logToDiscord(`migration at cycle ${curCycle} partially failed`, {
            error: migrationResult.partialProcessedError,
            processingId: migrationResult.currentProcessingId,
          }),
        );
        break;
      }

      try {
        // Dual purpose: Delay & Kill switch
        const checkpointEvent = await step.waitForEvent<CycleCheckpointEvent>(`cycle-checkpoint-${curCycle}`, {
          type: CHECKPOINT_EVENT_TYPE,
          timeout: maxDelay,
        });

        if (checkpointEvent.payload.kill) {
          console.warn('kill signal recieved');
          break;
        }
      } catch (e: unknown) {}
    }

    await step.do('noti-end', async () => this.logToDiscord(`migration ended`, { instanceId }));
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
