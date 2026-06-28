import type { AppDatabase } from '#server/lib/db';
import {
  createDynamicMock,
  createMockProtectedContext,
  expectDynamicMock,
  expectMockDatabase,
  mockDrizzleOrm,
  mockSchemaModule,
  type MockProtectedContext,
} from '#server/test/mocks';
import { nanoid } from 'nanoid';
import {
  CREATE_ID,
  getExistingChildrenData,
  processSaveExpense,
  queueExpenseAdjustments,
  queueExpenseItems,
  queueMainExpenseRecord,
  saveExpenseInputSchema,
  verifyExpenseVersion,
  type SaveExpenseHelpers,
  type SaveExpenseInput,
  type SaveExpenseRepo,
} from './saveExpense';
import { calculateExpense, type ExpenseCalculationResult } from '#server/lib/expenseHelper';
import BatchCollector from '#server/lib/BatchCollector';
import type { Mock } from 'vitest';
import { getLocationBoxId } from '../../lib/utils';
import { zocker } from 'zocker';

vi.mock(import('drizzle-orm'), importOriginal => {
  return mockDrizzleOrm(importOriginal);
});

vi.mock(import('#schema'), importOriginal => {
  return mockSchemaModule(importOriginal);
});

vi.mock(import('../../lib/expenseHelper'), () => ({ calculateExpense: vi.fn() }));
vi.mock(import('../../lib/utils'), () => ({ getLocationBoxId: vi.fn() }));
vi.mock(import('./indexing'), () => ({ processSaveExpenseSearchIndexing: vi.fn() }));

describe('helpers', async () => {
  const [schema] = await Promise.all([import('#schema')]);
  let expenseId: string;
  let mockContext: MockProtectedContext;
  let db: AppDatabase;
  let userId: string;

  beforeEach(() => {
    mockContext = createMockProtectedContext();
    db = mockContext.db;
    userId = mockContext.userId;
    expenseId = nanoid();
  });

  describe(verifyExpenseVersion, () => {
    it('should get existing expense and return', async () => {
      const expense = await verifyExpenseVersion(db, userId, expenseId, 3, {
        getExtgExpense: vi.fn().mockReturnValue({ userId, version: 2 }),
      });

      expect(expense).toBeDefined();
      expect(expense.userId).toBe(userId);
      expect(expense.version).toBe(2);
    });

    it('should throw TRPC error with code FORBIDDEN when no expense is found', async () => {
      await expect(() =>
        verifyExpenseVersion(db, userId, expenseId, 3, {
          getExtgExpense: vi.fn().mockReturnValue(null),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`[TRPCError: FORBIDDEN]`);
    });

    it('should throw TRPC error with code CONFLICT when expense is found with newer version', async () => {
      await expect(() =>
        verifyExpenseVersion(db, userId, expenseId, 3, {
          getExtgExpense: vi.fn().mockReturnValue({ userId, version: 4 }),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`[TRPCError: CONFLICT]`);
    });
  });

  describe(getExistingChildrenData, () => {
    it('should gather the children ids into supplied set', async () => {
      const itemIds = Array.from({ length: 2 }).map(() => nanoid());
      const adjustmentIds = Array.from({ length: 2 }).map(() => nanoid());

      const items = itemIds.map(id => ({ id }));
      const adjustments = adjustmentIds.map(id => ({ id }));

      const extgItemIds = new Set<string>();
      const extgAdjustmentIds = new Set<string>();

      await getExistingChildrenData(db, expenseId, extgItemIds, extgAdjustmentIds, {
        getExtgExpenseChildrenIds: vi.fn().mockReturnValue([items, adjustments]),
      });

      expect(extgItemIds).toEqual(new Set(itemIds));
      expect(extgAdjustmentIds).toEqual(new Set(adjustmentIds));
    });
  });

  describe(queueMainExpenseRecord, () => {
    let collector: BatchCollector;
    let collectorPushSpy: Mock<(...arg: Parameters<BatchCollector['push']>) => void>;
    const deps = { generateId: vi.fn(), insertSubject: vi.fn(), upsertMainExpense: vi.fn() };

    beforeEach(() => {
      collector = new BatchCollector();
      collectorPushSpy = vi.spyOn(collector, 'push');
      vi.clearAllMocks();
    });

    it('should call upsertMainExpense to save values base on info and push return into batch collector', async () => {
      const netTotalCents = 60_00;
      const expectedBoxId = 2903487923848;
      const mockedCalculateExpense = vi
        .mocked(calculateExpense)
        .mockReturnValue({ netTotalCents } as ExpenseCalculationResult);
      const mockedGetLocationBoxId = vi.mocked(getLocationBoxId).mockReturnValue([expectedBoxId]);
      const batchItem0 = 'Main Expense Upserted';
      deps.insertSubject.mockThrow('Should not be called');
      deps.upsertMainExpense.mockReturnValue(batchItem0);

      const accountId = nanoid();
      const categoryId = nanoid();
      const shopName = 'Just another shop';
      const shopMall = 'Just another mall';

      const input: SaveExpenseInput = {
        expenseId: 'ignore this id :X',
        billedAt: new Date(),
        shopMall,
        shopName,
        specifiedAmountCents: 0,
        type: 'physical',
        version: 1,
        latitude: 1.258837,
        longitude: 103.8093661,
        account: { value: accountId, label: '' },
        category: { value: categoryId, label: '' },
        items: [
          {
            id: nanoid(),
            name: 'item0',
            priceCents: 3000,
            isDeleted: false,
            quantity: 2,
          },
        ],
        adjustments: [
          {
            id: nanoid(),
            name: 'adj0',
            amountCents: 5000,
            expenseItemId: undefined,
            rateBps: undefined,
            isDeleted: false,
          },
        ],
      };

      queueMainExpenseRecord(collector, db, userId, expenseId, input, deps);

      expect(mockedCalculateExpense).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          specifiedAmountCents: input.specifiedAmountCents,
          items: input.items,
          adjustments: input.adjustments,
        }),
      );

      expect(mockedGetLocationBoxId).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ latitude: input.latitude, longitude: input.longitude }),
      );

      expect(deps.upsertMainExpense).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        expect.objectContaining({
          id: expenseId,
          userId,
          updatedBy: userId,
          shopMall,
          shopName,
          accountId,
          categoryId,
          amountCents: netTotalCents,
          boxId: expectedBoxId,
          type: input.type,
          specifiedAmountCents: input.specifiedAmountCents,
          billedAt: input.billedAt,
        }),
      );
      expect(collectorPushSpy).toHaveBeenCalledExactlyOnceWith(batchItem0);
    });

    it('should create account if account.id is create', () => {
      const netTotalCents = 80_00;
      const expectedAccountId = nanoid();
      vi.mocked(calculateExpense).mockReturnValue({ netTotalCents } as ExpenseCalculationResult);
      const batchItem0 = 'Account created';
      const batchItem1 = 'Main Expense Upserted';
      const accountName = 'accountName';
      deps.insertSubject.mockReturnValue(batchItem0);
      deps.upsertMainExpense.mockReturnValue(batchItem1);
      deps.generateId.mockReturnValueOnce(expectedAccountId);

      queueMainExpenseRecord(
        collector,
        db,
        userId,
        expenseId,
        { account: { value: CREATE_ID, label: accountName } } as SaveExpenseInput,
        deps,
      );

      expect(deps.insertSubject).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        schema.accountsTable,
        expectedAccountId,
        accountName,
        userId,
      );
      expect(deps.upsertMainExpense).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        expect.objectContaining({ accountId: expectedAccountId }),
      );
      expect(collectorPushSpy).toHaveBeenNthCalledWith(1, batchItem0);
      expect(collectorPushSpy).toHaveBeenNthCalledWith(2, batchItem1);
    });

    it('should create category if category.id is create', () => {
      const netTotalCents = 80_00;
      const expectedAccountId = nanoid();
      vi.mocked(calculateExpense).mockReturnValue({ netTotalCents } as ExpenseCalculationResult);
      const batchItem0 = 'Category created';
      const batchItem1 = 'Main Expense Upserted';
      const categoryName = 'categoryName';
      deps.insertSubject.mockReturnValue(batchItem0);
      deps.upsertMainExpense.mockReturnValue(batchItem1);
      deps.generateId.mockReturnValueOnce(expectedAccountId);

      queueMainExpenseRecord(
        collector,
        db,
        userId,
        expenseId,
        { category: { value: CREATE_ID, label: categoryName } } as SaveExpenseInput,
        deps,
      );

      expect(deps.insertSubject).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        schema.categoriesTable,
        expectedAccountId,
        categoryName,
        userId,
      );
      expect(deps.upsertMainExpense).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        expect.objectContaining({ categoryId: expectedAccountId }),
      );
      expect(collectorPushSpy).toHaveBeenNthCalledWith(1, batchItem0);
      expect(collectorPushSpy).toHaveBeenNthCalledWith(2, batchItem1);
    });
  });

  describe(queueExpenseItems, () => {
    let collector: BatchCollector;
    let collectorPushSpy: Mock<(...arg: Parameters<BatchCollector['push']>) => void>;
    const deps = { generateId: vi.fn(), upsertExpenseItems: vi.fn(), markExpenseChildAsDeleted: vi.fn() };
    let expenseId: string;

    beforeEach(() => {
      collector = new BatchCollector();
      collectorPushSpy = vi.spyOn(collector, 'push');
      expenseId = nanoid();
      vi.clearAllMocks();
    });

    it('should map items and call upsertExpenseItems with the correct values', () => {
      const extgItemIds = new Set<string>();
      const items: SaveExpenseInput['items'] = [
        { id: 'id1', isDeleted: false, name: 'name1', priceCents: 500, quantity: 2 },
        { id: 'id2', isDeleted: false, name: 'name2', priceCents: 300, quantity: 3 },
      ];
      const batchItem0 = 'Expense Items Upserted';

      deps.upsertExpenseItems.mockReturnValue(batchItem0);
      deps.markExpenseChildAsDeleted.mockThrow('shouldnt have happened');

      queueExpenseItems(collector, db, expenseId, items, extgItemIds, deps);

      expect(deps.upsertExpenseItems).toHaveBeenCalledExactlyOnceWith(expectMockDatabase(), [
        expect.objectContaining({ ...items[0], expenseId, sequence: 0 }),
        expect.objectContaining({ ...items[1], expenseId, sequence: 1 }),
      ]);
      expect(deps.markExpenseChildAsDeleted).not.toHaveBeenCalled();
      expect(collectorPushSpy).toHaveBeenCalledExactlyOnceWith(batchItem0);
    });

    it('should treat generate new id if input id is create', () => {
      const extgItemIds = new Set<string>([]);
      const items: SaveExpenseInput['items'] = [
        { id: CREATE_ID, isDeleted: false, name: 'name1', priceCents: 500, quantity: 2 },
      ];
      const batchItem0 = 'Expense Items Upserted';
      const expectedId = nanoid();
      deps.generateId.mockReturnValue(expectedId);
      deps.upsertExpenseItems.mockReturnValue(batchItem0);
      deps.markExpenseChildAsDeleted.mockThrow('shouldnt have happened');

      queueExpenseItems(collector, db, expenseId, items, extgItemIds, deps);

      expect(deps.upsertExpenseItems).toHaveBeenCalledExactlyOnceWith(expectMockDatabase(), [
        expect.objectContaining({ ...items[0], id: expectedId, expenseId, sequence: 0 }),
      ]);
      expect(deps.markExpenseChildAsDeleted).not.toHaveBeenCalled();
      expect(collectorPushSpy).toHaveBeenCalledExactlyOnceWith(batchItem0);
    });

    it('should call markExpenseChildAsDeleted when there is extg ids missing from input', () => {
      const deletingId = 'deleting1';
      const extgItemIds = new Set<string>([deletingId]);
      const items: SaveExpenseInput['items'] = [
        { id: 'id1', isDeleted: false, name: 'name1', priceCents: 500, quantity: 2 },
      ];
      const batchItem0 = 'Expense Items Upserted';
      const batchItem1 = 'Expense Items mark deleted';

      deps.upsertExpenseItems.mockReturnValue(batchItem0);
      deps.markExpenseChildAsDeleted.mockReturnValue(batchItem1);

      queueExpenseItems(collector, db, expenseId, items, extgItemIds, deps);

      expect(deps.upsertExpenseItems).toHaveBeenCalledExactlyOnceWith(expectMockDatabase(), [
        expect.objectContaining({ ...items[0], expenseId, sequence: 0 }),
      ]);
      expect(deps.markExpenseChildAsDeleted).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        schema.expenseItemsTable,
        expenseId,
        new Set([deletingId]),
      );
      expect(collectorPushSpy).toHaveBeenNthCalledWith(1, batchItem0);
      expect(collectorPushSpy).toHaveBeenNthCalledWith(2, batchItem1);
    });

    it('should treat isDeleted record in input as gone', () => {
      const deletingId = 'id1';
      const extgItemIds = new Set<string>([deletingId]);
      const items: SaveExpenseInput['items'] = [
        { id: 'id1', isDeleted: true, name: 'name1', priceCents: 500, quantity: 2 },
      ];
      const batchItem0 = 'Expense Items mark deleted';

      deps.upsertExpenseItems.mockThrow('shouldnt have been called');
      deps.markExpenseChildAsDeleted.mockReturnValue(batchItem0);

      queueExpenseItems(collector, db, expenseId, items, extgItemIds, deps);

      expect(deps.upsertExpenseItems).not.toHaveBeenCalled();
      expect(deps.markExpenseChildAsDeleted).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        schema.expenseItemsTable,
        expenseId,
        new Set([deletingId]),
      );
      expect(collectorPushSpy).toHaveBeenNthCalledWith(1, batchItem0);
    });
  });

  describe(queueExpenseAdjustments, () => {
    let collector: BatchCollector;
    let collectorPushSpy: Mock<(...arg: Parameters<BatchCollector['push']>) => void>;
    const deps = { generateId: vi.fn(), upsertExpenseAdjustments: vi.fn(), markExpenseChildAsDeleted: vi.fn() };
    let expenseId: string;

    beforeEach(() => {
      collector = new BatchCollector();
      collectorPushSpy = vi.spyOn(collector, 'push');
      expenseId = nanoid();
      vi.clearAllMocks();
    });

    it('should map adjustments and call upsertExpenseAdjustments with the correct values', () => {
      const extgItemIds = new Set<string>();
      const adjs: SaveExpenseInput['adjustments'] = [
        { id: 'id1', isDeleted: false, name: 'name1', amountCents: 0, rateBps: 4000, expenseItemId: undefined },
        { id: 'id2', isDeleted: false, name: 'name2', amountCents: 4000, rateBps: 0, expenseItemId: undefined },
        { id: 'id3', isDeleted: false, name: 'name3', amountCents: 0, rateBps: 4000, expenseItemId: 'item1' },
      ];
      const batchItem0 = 'Expense djustments Upserted';

      deps.upsertExpenseAdjustments.mockReturnValue(batchItem0);
      deps.markExpenseChildAsDeleted.mockThrow('shouldnt have happened');

      queueExpenseAdjustments(collector, db, expenseId, adjs, extgItemIds, deps);

      expect(deps.upsertExpenseAdjustments).toHaveBeenCalledExactlyOnceWith(expectMockDatabase(), [
        expect.objectContaining({ ...adjs[0], expenseId, sequence: 0 }),
        expect.objectContaining({ ...adjs[1], expenseId, sequence: 1 }),
        expect.objectContaining({ ...adjs[2], expenseId, sequence: 2 }),
      ]);
      expect(deps.markExpenseChildAsDeleted).not.toHaveBeenCalled();
      expect(collectorPushSpy).toHaveBeenCalledExactlyOnceWith(batchItem0);
    });

    it('should treat generate new id if input id is create', () => {
      const extgItemIds = new Set<string>([]);
      const adjs: SaveExpenseInput['adjustments'] = [
        { id: CREATE_ID, isDeleted: false, name: 'name1', amountCents: 4000, rateBps: 0, expenseItemId: undefined },
      ];
      const batchItem0 = 'Expense Adjustments Upserted';
      const expectedId = nanoid();
      deps.generateId.mockReturnValue(expectedId);
      deps.upsertExpenseAdjustments.mockReturnValue(batchItem0);
      deps.markExpenseChildAsDeleted.mockThrow('shouldnt have happened');

      queueExpenseAdjustments(collector, db, expenseId, adjs, extgItemIds, deps);

      expect(deps.upsertExpenseAdjustments).toHaveBeenCalledExactlyOnceWith(expectMockDatabase(), [
        expect.objectContaining({ ...adjs[0], id: expectedId, expenseId, sequence: 0 }),
      ]);
      expect(deps.markExpenseChildAsDeleted).not.toHaveBeenCalled();
      expect(collectorPushSpy).toHaveBeenCalledExactlyOnceWith(batchItem0);
    });

    it('should call markExpenseChildAsDeleted when there is extg ids missing from input', () => {
      const deletingId = 'deleting1';
      const extgItemIds = new Set<string>([deletingId]);
      const adjs: SaveExpenseInput['adjustments'] = [
        { id: 'id1', isDeleted: false, name: 'name1', amountCents: 4000, rateBps: 0, expenseItemId: undefined },
      ];
      const batchItem0 = 'Expense Adjustments Upserted';
      const batchItem1 = 'Expense Adjustments mark deleted';

      deps.upsertExpenseAdjustments.mockReturnValue(batchItem0);
      deps.markExpenseChildAsDeleted.mockReturnValue(batchItem1);

      queueExpenseAdjustments(collector, db, expenseId, adjs, extgItemIds, deps);

      expect(deps.upsertExpenseAdjustments).toHaveBeenCalledExactlyOnceWith(expectMockDatabase(), [
        expect.objectContaining({ ...adjs[0], expenseId, sequence: 0 }),
      ]);
      expect(deps.markExpenseChildAsDeleted).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        schema.expenseAdjustmentsTable,
        expenseId,
        new Set([deletingId]),
      );
      expect(collectorPushSpy).toHaveBeenNthCalledWith(1, batchItem0);
      expect(collectorPushSpy).toHaveBeenNthCalledWith(2, batchItem1);
    });

    it('should treat isDeleted record in input as gone', () => {
      const deletingId = 'id1';
      const extgItemIds = new Set<string>([deletingId]);
      const adjs: SaveExpenseInput['adjustments'] = [
        { id: 'id1', isDeleted: true, name: 'name1', amountCents: 4000, rateBps: 0, expenseItemId: undefined },
      ];
      const batchItem0 = 'Expense Adjustments mark deleted';

      deps.upsertExpenseAdjustments.mockThrow('shouldnt have been called');
      deps.markExpenseChildAsDeleted.mockReturnValue(batchItem0);

      queueExpenseAdjustments(collector, db, expenseId, adjs, extgItemIds, deps);

      expect(deps.upsertExpenseAdjustments).not.toHaveBeenCalled();
      expect(deps.markExpenseChildAsDeleted).toHaveBeenCalledExactlyOnceWith(
        expectMockDatabase(),
        schema.expenseAdjustmentsTable,
        expenseId,
        new Set([deletingId]),
      );
      expect(collectorPushSpy).toHaveBeenNthCalledWith(1, batchItem0);
    });
  });
});

describe(processSaveExpense, async () => {
  let deps = createDynamicMock<SaveExpenseHelpers & SaveExpenseRepo>('deps');
  const expectDeps = () => expectDynamicMock('deps');
  const [{ processSaveExpenseSearchIndexing }] = await Promise.all([import('./indexing')]);
  const mockedIndexing = vi.mocked(processSaveExpenseSearchIndexing);
  const inputGenerator = zocker(saveExpenseInputSchema)
    .supply(saveExpenseInputSchema.shape.expenseId, () => nanoid())
    .supply(saveExpenseInputSchema.shape.items.element.shape.id, () => nanoid())
    .supply(saveExpenseInputSchema.shape.adjustments.element.shape.id, () => nanoid())
    .supply(saveExpenseInputSchema.shape.expenseId, () => nanoid())
    .array({ min: 2, max: 2 });
  let mockContext: MockProtectedContext;
  let userId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockProtectedContext({ dbMode: 'mock' });
    userId = mockContext.userId;
  });

  it('should call helper verify and fetch extg record, when input.expenseId is not create', async () => {
    const input = inputGenerator.generate();
    await processSaveExpense(mockContext, input, deps);

    expect(deps.verifyExpenseVersion).toHaveBeenCalledExactlyOnceWith(
      expectMockDatabase(),
      userId,
      input.expenseId,
      input.version,
      expectDeps(),
    );

    expect(deps.getExistingChildrenData).toHaveBeenCalledExactlyOnceWith(
      expectMockDatabase(),
      input.expenseId,
      expect.any(Set),
      expect.any(Set),
      expectDeps(),
    );

    expect(deps.queueMainExpenseRecord).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      userId,
      input.expenseId,
      input,
      expectDeps(),
    );

    expect(deps.queueExpenseItems).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      input.expenseId,
      input.items,
      expect.any(Set),
      expectDeps(),
    );

    expect(deps.queueExpenseAdjustments).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      input.expenseId,
      input.adjustments,
      expect.any(Set),
      expectDeps(),
    );

    expect(mockedIndexing).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      expect.objectContaining({ id: input.expenseId, userId }),
    );
  });

  it('should call generateId when input.expenseId is create and use the id when calling helper methods', async () => {
    const expectedExpenseId = nanoid();
    deps.generateId.mockReturnValue(expectedExpenseId);
    const input = inputGenerator.generate();
    input.expenseId = CREATE_ID;
    await processSaveExpense(mockContext, input, deps);
    expect(deps.generateId).toHaveBeenCalled();

    expect(deps.queueMainExpenseRecord).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      userId,
      expectedExpenseId,
      input,
      expectDeps(),
    );

    expect(deps.queueExpenseItems).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      expectedExpenseId,
      input.items,
      expect.any(Set),
      expectDeps(),
    );

    expect(deps.queueExpenseAdjustments).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      expectedExpenseId,
      input.adjustments,
      expect.any(Set),
      expectDeps(),
    );

    expect(mockedIndexing).toHaveBeenCalledExactlyOnceWith(
      expect.any(BatchCollector),
      expectMockDatabase(),
      expect.objectContaining({ id: expectedExpenseId, userId }),
    );
  });

  it('should exectue batch with collected statements', async () => {
    const input = inputGenerator.generate();
    // @ts-expect-error, collector will put these into an array, dont need to be sqlite query
    deps.queueMainExpenseRecord.mockImplementation(collector => collector.push('Test 1', 'Test 1'));
    // @ts-expect-error, collector will put these into an array, dont need to be sqlite query
    deps.queueExpenseItems.mockImplementation(collector => collector.push('Test 2', 'Test 2'));
    // @ts-expect-error, collector will put these into an array, dont need to be sqlite query
    deps.queueExpenseAdjustments.mockImplementation(collector => collector.push('Test 3', 'Test 3'));
    mockContext.addDbResult(['Result 1', 'Result 2', 'Result 3']);

    await processSaveExpense(mockContext, input, deps);

    expect(mockContext.dbSpies.batch).toHaveBeenCalledExactlyOnceWith(['Test 1', 'Test 2', 'Test 3']);
  });
});
