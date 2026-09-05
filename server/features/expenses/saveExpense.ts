import BatchCollector from '#server/lib/BatchCollector';
import { excludedAll, type AppDatabase } from '#server/lib/db';
import type { ProtectedContext } from '#server/lib/trpc';
import { parseISO } from 'date-fns';
import z from 'zod';
import {
  accountsTable,
  categoriesTable,
  expenseAccountAllocationsTable,
  expenseAdjustmentsTable,
  expenseAttachmentsTable,
  expenseCategoryAllocationsTable,
  expenseItemsTable,
  expensesTable,
  generateId,
} from '#schema';
import { and, eq, inArray, notInArray, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { getLocationBoxId } from '#server/lib/utils';
import { calculateExpense, type ExpenseCalculationResult } from '#server/lib/expenseHelper';
import { processSaveExpenseSearchIndexing } from './indexing';
import { getFileIdsByRequestId } from '#server/lib/fileUpload';

export const saveExpenseInputSchema = z.object({
  expenseId: z.string().nullable(),
  version: z.int().optional().default(0),
  billedAt: z.iso.datetime({ error: 'Invalid date time' }).transform(val => parseISO(val)),
  accountAllocs: z.array(
    z.object({
      account: z.object({ value: z.string().nullable(), label: z.string().trim() }).nullish(),
      amountCents: z.number(),
    }),
  ),
  categoryAllocs: z.array(
    z.object({
      category: z.object({ value: z.string().nullable(), label: z.string().trim() }).nullish(),
      amountCents: z.number(),
    }),
  ),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  geoAccuracy: z.number().nullish(),
  shopName: z
    .string()
    .trim()
    .nullish()
    .transform(v => (v ? v : null)),
  shopMall: z
    .string()
    .trim()
    .nullish()
    .transform(v => (v ? v : null)),
  type: z.enum(['online', 'physical']),
  specifiedAmountCents: z.int().min(0, { error: 'Must be non-negative value' }),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string().trim(),
      priceCents: z.int().min(0, { error: 'Must be non-negative value' }),
      quantity: z.int().min(0, { error: 'Must be non-negative value' }),
      isDeleted: z.boolean().optional().default(false),
    }),
  ),
  adjustments: z.array(
    z.object({
      id: z.string(),
      name: z.string().trim(),
      amountCents: z.int().default(0),
      rateBps: z
        .int()
        .nullish()
        .transform(v => v ?? undefined),
      expenseItemId: z
        .string()
        .nullish()
        .transform(v => v ?? undefined),
      isDeleted: z.boolean().optional().default(false),
    }),
  ),
  attachmentFileIds: z.array(z.string()),
  fileUploadRequestId: z.string().optional(),
});

export const CREATE_ID = 'create' as const;
export type SaveExpenseInput = z.infer<typeof saveExpenseInputSchema>;

export const saveExpenseRepo = {
  generateId,
  getExtgExpense: (db: AppDatabase, expenseId: string, userId: string) =>
    db.query.expensesTable.findFirst({
      where: { id: expenseId, userId },
      columns: { userId: true, isDeleted: true, version: true, shopName: true, shopMall: true },
    }),
  getExtgExpenseChildrenIds: (db: AppDatabase, expenseId: string) =>
    db.batch([
      db
        .select({ id: expenseItemsTable.id })
        .from(expenseItemsTable)
        .where(and(eq(expenseItemsTable.expenseId, expenseId), eq(expenseItemsTable.isDeleted, false))),
      db
        .select({ id: expenseAdjustmentsTable.id })
        .from(expenseAdjustmentsTable)
        .where(and(eq(expenseAdjustmentsTable.expenseId, expenseId), eq(expenseAdjustmentsTable.isDeleted, false))),
    ]),
  upsertMainExpense: (db: AppDatabase, value: typeof expensesTable.$inferInsert) =>
    db
      .insert(expensesTable)
      .values(value)
      .onConflictDoUpdate({ target: expensesTable.id, set: excludedAll(expensesTable, ['userId']) }),
  upsertExpenseItems: (db: AppDatabase, itemsRecords: (typeof expenseItemsTable.$inferInsert)[]) =>
    db
      .insert(expenseItemsTable)
      .values(itemsRecords)
      .onConflictDoUpdate({
        target: expenseItemsTable.id,
        set: excludedAll(expenseItemsTable),
      }),
  upsertExpenseAdjustments: (db: AppDatabase, adjustmentsRecords: (typeof expenseAdjustmentsTable.$inferInsert)[]) =>
    db
      .insert(expenseAdjustmentsTable)
      .values(adjustmentsRecords)
      .onConflictDoUpdate({
        target: expenseAdjustmentsTable.id,
        set: excludedAll(expenseAdjustmentsTable),
      }),
  markExpenseChildAsDeleted: (
    db: AppDatabase,
    table: typeof expenseItemsTable | typeof expenseAdjustmentsTable,
    expenseId: string,
    ids: Iterable<string>,
  ) =>
    db
      .update(table)
      .set({ isDeleted: true })
      .where(and(eq(table.expenseId, expenseId), inArray(table.id, Array.from(ids)))),
  upsertAttachments: (db: AppDatabase, expenseAttachmentRecords: (typeof expenseAttachmentsTable.$inferInsert)[]) =>
    db.insert(expenseAttachmentsTable).values(expenseAttachmentRecords).onConflictDoNothing(),
  deleteAttachmentIfNotInList: (db: AppDatabase, expenseId: string, fileIds: string[]) =>
    db
      .delete(expenseAttachmentsTable)
      .where(
        and(eq(expenseAttachmentsTable.expenseId, expenseId), notInArray(expenseAttachmentsTable.fileId, fileIds)),
      ),
  getExistingSubjects: (
    db: AppDatabase,
    table: typeof accountsTable | typeof categoriesTable,
    userId: string,
    idsOrNames: string[],
  ) =>
    db
      .select({ value: table.id, label: table.name })
      .from(table)
      .where(and(eq(table.userId, userId), or(inArray(table.id, idsOrNames), inArray(table.name, idsOrNames)))),
  insertSubjects: (
    db: AppDatabase,
    table: typeof accountsTable | typeof categoriesTable,
    userId: string,
    records: { value: string; label: string }[],
  ) =>
    db.insert(table).values(records.map(({ value, label }) => ({ id: value, name: label, userId, isDeleted: false }))),
  upsertExpenseAccountAllocations: (db: AppDatabase, records: (typeof expenseAccountAllocationsTable.$inferSelect)[]) =>
    db
      .insert(expenseAccountAllocationsTable)
      .values(records)
      .onConflictDoUpdate({
        target: [expenseAccountAllocationsTable.expenseId, expenseAccountAllocationsTable.accountId],
        set: excludedAll(expenseAccountAllocationsTable, ['expenseId', 'accountId']),
      }),
  deleteExpenseAccountAllocationsIfNotInList: (db: AppDatabase, expenseId: string, accountIds: string[]) =>
    db
      .delete(expenseAccountAllocationsTable)
      .where(
        and(
          eq(expenseAccountAllocationsTable.expenseId, expenseId),
          notInArray(expenseAccountAllocationsTable.accountId, accountIds),
        ),
      ),
  upsertExpenseCategoryAllocations: (
    db: AppDatabase,
    records: (typeof expenseCategoryAllocationsTable.$inferSelect)[],
  ) =>
    db
      .insert(expenseCategoryAllocationsTable)
      .values(records)
      .onConflictDoUpdate({
        target: [expenseCategoryAllocationsTable.expenseId, expenseCategoryAllocationsTable.categoryId],
        set: excludedAll(expenseCategoryAllocationsTable, ['expenseId', 'categoryId']),
      }),
  deleteExpenseCategoryAllocationsIfNotInList: (db: AppDatabase, expenseId: string, categoryIds: string[]) =>
    db
      .delete(expenseCategoryAllocationsTable)
      .where(
        and(
          eq(expenseCategoryAllocationsTable.expenseId, expenseId),
          notInArray(expenseCategoryAllocationsTable.categoryId, categoryIds),
        ),
      ),
};

export type SaveExpenseRepo = typeof saveExpenseRepo;
type PickRepos<TName extends keyof SaveExpenseRepo> = Pick<SaveExpenseRepo, TName>;

const saveExpenseHelpers = {
  verifyExpenseVersion,
  getExistingChildrenData,
  queueMainExpenseRecord,
  queueExpenseItems,
  queueExpenseAdjustments,
  queueExpenseAttachments,
};

export type SaveExpenseHelpers = typeof saveExpenseHelpers;

const allDeps = { ...saveExpenseRepo, ...saveExpenseHelpers };

export async function processSaveExpense(context: ProtectedContext, input: SaveExpenseInput, deps = allDeps) {
  const { user, db } = context;
  const userId = user.id;
  let expenseId = input.expenseId;
  const extgItemIds = new Set<string>();
  const extgAdjIds = new Set<string>();

  if (expenseId != null) {
    await deps.verifyExpenseVersion(db, userId, expenseId, input.version, deps);
    await deps.getExistingChildrenData(db, expenseId, extgItemIds, extgAdjIds, deps);
  } else {
    expenseId = deps.generateId();
  }

  const collector = new BatchCollector();
  const calculationResult = calculateExpense(input);
  deps.queueMainExpenseRecord(collector, db, userId, expenseId, input, calculationResult, deps);
  deps.queueExpenseItems(collector, db, expenseId, input.items, extgItemIds, deps);
  deps.queueExpenseAdjustments(collector, db, expenseId, input.adjustments, extgAdjIds, deps);
  await deps.queueExpenseAttachments(
    collector,
    db,
    userId,
    expenseId,
    input.fileUploadRequestId,
    input.attachmentFileIds,
    deps,
  );
  await processSaveExpenseSearchIndexing(collector, db, { ...input, id: expenseId, userId });

  await collector.executeBatch(db, true);
}

export async function verifyExpenseVersion(
  db: AppDatabase,
  userId: string,
  expenseId: string,
  inputVersion: number,
  { getExtgExpense }: PickRepos<'getExtgExpense'> = saveExpenseRepo,
) {
  const extgExpense = await getExtgExpense(db, expenseId, userId);

  if (!extgExpense) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  if (extgExpense.version > inputVersion) {
    throw new TRPCError({ code: 'CONFLICT' });
  }

  return extgExpense;
}

export async function getExistingChildrenData(
  db: AppDatabase,
  expenseId: string,
  extgItemIds: Set<string>,
  extgAdjustmentIds: Set<string>,
  { getExtgExpenseChildrenIds }: PickRepos<'getExtgExpenseChildrenIds'> = saveExpenseRepo,
) {
  const [items, adjustments] = await getExtgExpenseChildrenIds(db, expenseId);

  for (const { id } of items) {
    extgItemIds.add(id);
  }

  for (const { id } of adjustments) {
    extgAdjustmentIds.add(id);
  }
}

export function queueMainExpenseRecord(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  expenseId: string,
  input: SaveExpenseInput,
  calculateExpenseResult: ExpenseCalculationResult,
  deps: PickRepos<'upsertMainExpense' | 'generateId'> = saveExpenseRepo,
) {
  const [boxId] =
    input.latitude && input.longitude
      ? getLocationBoxId({ latitude: input.latitude, longitude: input.longitude })
      : [null];

  collector.push(
    deps.upsertMainExpense(db, {
      id: expenseId,
      amountCents: calculateExpenseResult.netTotalCents,
      billedAt: input.billedAt,
      userId: userId,
      type: input.type,
      updatedBy: userId,
      latitude: input.latitude,
      longitude: input.longitude,
      geoAccuracy: input.geoAccuracy,
      boxId,
      shopName: input.shopName,
      shopMall: input.shopMall,
      specifiedAmountCents: input.specifiedAmountCents,
    }),
  );
}

export function queueExpenseItems(
  collector: BatchCollector,
  db: AppDatabase,
  expenseId: string,
  items: SaveExpenseInput['items'],
  extgItemIds: Set<string>,
  deps: PickRepos<'generateId' | 'upsertExpenseItems' | 'markExpenseChildAsDeleted'> = saveExpenseRepo,
) {
  const itemsRecords: (typeof expenseItemsTable.$inferInsert)[] = [];
  const removedItemIds = new Set(extgItemIds);
  for (const item of items) {
    if (item.isDeleted) continue;
    if (item.id === CREATE_ID) item.id = deps.generateId();
    removedItemIds.delete(item.id);
    itemsRecords.push({ ...item, expenseId, sequence: itemsRecords.length });
  }

  if (itemsRecords.length > 0) {
    collector.push(deps.upsertExpenseItems(db, itemsRecords));
  }

  if (removedItemIds.size > 0) {
    collector.push(deps.markExpenseChildAsDeleted(db, expenseItemsTable, expenseId, removedItemIds));
  }
}

export function queueExpenseAdjustments(
  collector: BatchCollector,
  db: AppDatabase,
  expenseId: string,
  adjustments: SaveExpenseInput['adjustments'],
  extgAdjustmentIds: Set<string>,
  deps: PickRepos<'generateId' | 'upsertExpenseAdjustments' | 'markExpenseChildAsDeleted'> = saveExpenseRepo,
) {
  const adjustmentsRecords: (typeof expenseAdjustmentsTable.$inferInsert)[] = [];
  const removedAdjIds = new Set(extgAdjustmentIds);
  for (const adj of adjustments) {
    if (adj.isDeleted) continue;
    if (adj.id === CREATE_ID) adj.id = deps.generateId();
    removedAdjIds.delete(adj.id);
    adjustmentsRecords.push({ ...adj, expenseId, sequence: adjustmentsRecords.length });
  }

  if (adjustmentsRecords.length > 0) {
    collector.push(deps.upsertExpenseAdjustments(db, adjustmentsRecords));
  }

  if (removedAdjIds.size > 0) {
    collector.push(deps.markExpenseChildAsDeleted(db, expenseAdjustmentsTable, expenseId, removedAdjIds));
  }
}

export async function queueExpenseAccountAllocations(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  expenseId: string,
  input: Pick<SaveExpenseInput, 'accountAllocs' | 'billedAt'>,
  calculateExpenseResult: Pick<ExpenseCalculationResult, 'netTotalCents'>,
  deps: PickRepos<
    | 'generateId'
    | 'getExistingSubjects'
    | 'insertSubjects'
    | 'upsertExpenseAccountAllocations'
    | 'deleteExpenseAccountAllocationsIfNotInList'
  >,
) {
  const idsOrNamesToCheck = input.accountAllocs
    .flatMap(({ account }) => (account ? [account.label.trim(), account.value] : undefined))
    .filter((value): value is string => Boolean(value));

  const existingSubjects = await deps.getExistingSubjects(db, accountsTable, userId, idsOrNamesToCheck);
  type Subject = (typeof existingSubjects)[number];
  const subjectByValue = new Map<string, Subject>();
  const subjectByLabel = new Map<string, Subject>();

  for (const account of existingSubjects) {
    subjectByLabel.set(account.label, account);
    subjectByValue.set(account.value, account);
  }

  const subjectsToCreate = new Map<string, Subject>();
  const amountsBySubjectId = new Map<string, number>();
  let totalCentsAllocated = 0;
  const accumulateAmount = (id: string, amountCents: number) => {
    const prev = amountsBySubjectId.get(id) ?? 0;
    amountsBySubjectId.set(id, prev + amountCents);
    totalCentsAllocated += amountCents;
  };

  for (const allocations of input.accountAllocs) {
    const { account: subject, amountCents } = allocations;
    if (allocations.amountCents === 0) continue;
    if (!subject) {
      accumulateAmount('', allocations.amountCents);
      continue;
    }

    let existingSub = subject.value ? subjectByValue.get(subject.value) : undefined;
    const label = subject.label.trim();
    existingSub ??= subjectByLabel.get(label);
    let subjectId = (existingSub ?? subjectsToCreate.get(label))?.value;
    if (!subjectId) {
      subjectId = deps.generateId();
      const newSubject: Subject = { label, value: subjectId };
      subjectsToCreate.set(label, newSubject);
    }
    accumulateAmount(subjectId, amountCents);
  }

  if (totalCentsAllocated < calculateExpenseResult.netTotalCents) {
    const unallocatedCents = calculateExpenseResult.netTotalCents - totalCentsAllocated;
    accumulateAmount('', unallocatedCents);
  }

  if (!subjectsToCreate.values().next().done) {
    collector.push(deps.insertSubjects(db, accountsTable, userId, subjectsToCreate.values().toArray()));
  }

  if (!amountsBySubjectId.entries().next().done) {
    collector.push(
      deps.upsertExpenseAccountAllocations(
        db,
        amountsBySubjectId
          .entries()
          .map(([accountId, amountCents], sequence) => ({
            expenseId,
            expenseBilledAt: input.billedAt,
            accountId,
            amountCents,
            sequence,
          }))
          .toArray(),
      ),
    );
  }
}

export async function queueExpenseAttachments(
  collector: BatchCollector,
  db: AppDatabase,
  userId: string,
  expenseId: string,
  fileUploadRequestId: SaveExpenseInput['fileUploadRequestId'],
  attachmentFileIds: SaveExpenseInput['attachmentFileIds'],
  deps: PickRepos<'upsertAttachments' | 'deleteAttachmentIfNotInList'>,
) {
  const fileIds = [...attachmentFileIds];

  if (fileUploadRequestId) {
    const newFileIds = await getFileIdsByRequestId(db, userId, fileUploadRequestId);
    fileIds.push(...newFileIds);
  }

  const attachmentRecords = fileIds.map(fileId => ({ expenseId, fileId }));
  if (attachmentRecords.length > 0) {
    collector.push(deps.upsertAttachments(db, attachmentRecords));
  }
  collector.push(deps.deleteAttachmentIfNotInList(db, expenseId, fileIds));
}
