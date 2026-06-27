import type { AppDatabase } from '#server/lib/db';
import {
  createMockProtectedContext,
  mockDrizzleOrm,
  mockSchemaModule,
  type MockProtectedContext,
} from '#server/test/mocks';
import { nanoid } from 'nanoid';
import { getExistingChildrenData, verifyExpenseVersion } from './saveExpense';

vi.mock(import('drizzle-orm'), importOriginal => {
  return mockDrizzleOrm(importOriginal);
});

vi.mock(import('#schema'), importOriginal => {
  return mockSchemaModule(importOriginal);
});

describe('helpers', () => {
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
});
