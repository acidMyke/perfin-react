import type { AppDatabase } from '#server/lib/db';
import {
  createMockProtectedContext,
  expectMockDatabase,
  mockDrizzleOrm,
  mockSchemaModule,
  type MockProtectedContext,
} from '#server/test/mocks';
import { nanoid } from 'nanoid';
import {
  CREATE_ID,
  getExistingChildrenData,
  queueMainExpenseRecord,
  verifyExpenseVersion,
  type SaveExpenseInput,
} from './saveExpense';
import { calculateExpense, type ExpenseCalculationResult } from '#server/lib/expenseHelper';
import BatchCollector from '#server/lib/BatchCollector';
import type { Mock } from 'vitest';
import { getLocationBoxId } from '../../lib/utils';

vi.mock(import('drizzle-orm'), importOriginal => {
  return mockDrizzleOrm(importOriginal);
});

vi.mock(import('#schema'), importOriginal => {
  return mockSchemaModule(importOriginal);
});

vi.mock(import('../../lib/expenseHelper'), () => ({ calculateExpense: vi.fn() }));
vi.mock(import('../../lib/utils'), () => ({ getLocationBoxId: vi.fn() }));

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

    it('should call save values accordingly base on info and push it into batch collector', async () => {
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
});
